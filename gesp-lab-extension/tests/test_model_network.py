import io
import json
import os
import socket
import ssl
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

from learning_service import model
from learning_service.doctor import check_network

CFG = dict(key='fixture-secret',base='https://model.example/compatible-mode/v1',
           model='qwen3.7-plus',visionModel='qwen3-vl-plus',timeout=1)


class ModelNetworkTests(unittest.TestCase):
    def test_stream_error_retries_without_exposing_upstream_message(self):
        failure=io.BytesIO(b'data: {"error":{"code":"overloaded","message":"fixture-secret"}}\n\n')
        failure.headers={'Content-Type':'text/event-stream'}
        success=io.BytesIO(json.dumps({'choices':[{'message':{'content':'{"ok":true}'},'finish_reason':'stop'}]}).encode())
        success.headers={'Content-Type':'application/json'}
        opener=Mock();opener.open.side_effect=[failure,success];progress=[]
        with patch.object(model,'build_opener',return_value=opener),patch.object(model.time,'sleep'):
            result=model.completion(CFG,'Return JSON',{},progress.append)
        self.assertEqual(result,{'ok':True});self.assertEqual(opener.open.call_count,2)
        self.assertNotIn('fixture-secret',str(progress))

    def test_thinking_stream_is_separate_from_final_json_and_progress(self):
        chunks=[{'reasoning_content':'private reasoning fixture','content':None},
                {'content':'{"summary":"ok",'}, {'content':'"issues":[]}'}]
        # Metadata/usage frames can have no choices, including before content.
        events=[{'choices':[],'usage':None}]+[{'choices':[{'index':0,'delta':delta,'finish_reason':None}]} for delta in chunks]
        events.append({'choices':[{'index':0,'delta':{},'finish_reason':'stop'}]})
        events.append({'choices':[],'usage':{'completion_tokens':20}})
        body=''.join('data: '+json.dumps(event)+'\n\n' for event in events)+'data: [DONE]\n\n'
        response=io.BytesIO(body.encode());response.headers={'Content-Type':'text/event-stream'}
        opener=Mock();opener.open.return_value=response;progress=[]
        with patch.object(model,'build_opener',return_value=opener),patch.object(model.time,'monotonic',side_effect=iter(range(100))):
            result=model.completion(CFG,'Return JSON',{},progress.append,enable_thinking=True,thinking_budget=8192,max_tokens=6500)
        payload=json.loads(opener.open.call_args.args[0].data)
        self.assertTrue(payload['enable_thinking'])
        self.assertEqual(payload['thinking_budget'],8192)
        self.assertEqual(payload['max_tokens'],6500)
        self.assertEqual(result,{'summary':'ok','issues':[]})
        self.assertTrue(any('深度思考' in message for message in progress))
        self.assertNotIn('private reasoning',json.dumps(result)+json.dumps(progress))

    def test_other_generation_keeps_thinking_disabled(self):
        response=io.BytesIO(json.dumps({'choices':[{'message':{'content':'{"ok":true}'},'finish_reason':'stop'}]}).encode())
        response.headers={'Content-Type':'application/json'}
        opener=Mock();opener.open.return_value=response
        with patch.object(model,'build_opener',return_value=opener):
            self.assertEqual(model.completion(CFG,'Return JSON',{}),{'ok':True})
        payload=json.loads(opener.open.call_args.args[0].data)
        self.assertFalse(payload['enable_thinking'])
        self.assertNotIn('thinking_budget',payload)

    def test_windows_permission_is_actionable_and_not_retried(self):
        cause = PermissionError(13, 'permission denied')
        cause.winerror = 10013
        opener = Mock()
        opener.open.side_effect = URLError(cause)
        with patch.object(model, 'build_opener', return_value=opener), patch.object(model.time, 'sleep') as sleep:
            with self.assertRaises(model.GenerationError) as caught:
                model.completion(CFG, 'Return JSON', {})
        self.assertEqual(caught.exception.code, 'network_permission')
        self.assertIn('10013', str(caught.exception))
        self.assertIn('start-learning.bat', str(caught.exception))
        self.assertNotIn(CFG['key'], str(caught.exception))
        self.assertEqual(opener.open.call_count, 1)
        sleep.assert_not_called()

    def test_dns_certificate_and_timeout_are_distinct(self):
        for cause, code in ((socket.gaierror(-2, 'dns'), 'dns'),
                            (ssl.SSLCertVerificationError(1, 'certificate'), 'tls_certificate'),
                            (TimeoutError(), 'connection')):
            self.assertEqual(model.connection_error(URLError(cause)).code, code)

    def test_certificate_failure_is_not_retried(self):
        opener = Mock()
        opener.open.side_effect = URLError(ssl.SSLCertVerificationError(1, 'certificate'))
        with patch.object(model, 'build_opener', return_value=opener):
            with self.assertRaises(model.GenerationError) as caught:
                model.completion(CFG, 'Return JSON', {})
        self.assertEqual(caught.exception.code, 'tls_certificate')
        self.assertEqual(opener.open.call_count, 1)

    def test_doctor_sends_no_key_and_does_not_claim_model_auth(self):
        opener = Mock()
        opener.open.side_effect = HTTPError(CFG['base']+'/models', 401, 'Unauthorized', {}, io.BytesIO())
        with patch('learning_service.doctor.build_opener', return_value=opener):
            report = check_network(CFG)
        self.assertTrue(report['reachable'])
        self.assertFalse(report['modelVerified'])
        self.assertEqual(report['httpStatus'], 401)
        request = opener.open.call_args.args[0]
        self.assertFalse(request.has_header('Authorization'))
        self.assertIsNone(request.data)
        self.assertNotIn(CFG['key'], json.dumps(report))

    def test_doctor_preserves_permission_failure(self):
        opener = Mock()
        opener.open.side_effect = URLError(PermissionError(13, 'denied'))
        with patch('learning_service.doctor.build_opener', return_value=opener):
            report = check_network(CFG)
        self.assertFalse(report['reachable'])
        self.assertEqual(report['code'], 'network_permission')


class ProviderSettingsTests(unittest.TestCase):
    def test_local_bailian_overrides_reference_key_url_and_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = root/'learning_service'
            service.mkdir()
            reference = root/'reference.env'
            reference.write_text('DASHSCOPE_API_KEY=old-fixture\nQWEN_BASE_URL=https://old.example/v1\nQWEN_MODEL=qwen-plus\n', encoding='utf-8')
            (service/'config.json').write_text(json.dumps(dict(model='qwen3.8-max',visionModel='qwen3-vl-plus',port=8766,timeout=180,explanationEnv=str(reference))), encoding='utf-8')
            (service/'.env').write_text('ALIBABA_BAILIAN_API_KEY=local-fixture\nALIBABA_BAILIAN_MODEL=qwen3.7-plus\nALIBABA_BAILIAN_OPENAI_COMPATIBLE=https://local.example/v1\n', encoding='utf-8')
            with patch.object(model, 'ROOT', root), patch.dict(os.environ, {}, clear=True):
                cfg = model.settings()
                self.assertEqual((cfg['key'],cfg['model'],cfg['base']), ('local-fixture','qwen3.7-plus','https://local.example/v1'))
                self.assertEqual(cfg['source'], '本机百炼配置')
                with patch.dict(os.environ, {'DASHSCOPE_API_KEY':'process-fixture','CODEARENA_QWEN_MODEL':'override','CODEARENA_QWEN_BASE_URL':'https://process.example/v1'}):
                    cfg = model.settings()
                    self.assertEqual((cfg['key'],cfg['model'],cfg['base']), ('process-fixture','override','https://process.example/v1'))


if __name__ == '__main__':
    unittest.main()
