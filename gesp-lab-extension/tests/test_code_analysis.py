import hashlib,json,sys,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request,build_opener,ProxyHandler
from urllib.error import HTTPError
from datetime import datetime
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
NOW=datetime(2026,11,12,12).timestamp()*1000
from learning_service.analysis_settings import AnalysisSettings
from learning_service.code_analysis import authorize,validate_review,analyze,GenerationError
from learning_service.server import Application,ThreadingHTTPServer,make_handler

class AnalysisTests(unittest.TestCase):
    def test_settings_are_password_protected_persistent_and_configurable(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings=AnalysisSettings(tmp)
            with self.assertRaises(GenerationError):settings.update(dict(currentPassword='wrong',dailyMinutes=20,failedChanges=8))
            self.assertFalse((Path(tmp)/'analysis-settings.json').exists())
            for minutes,count in [(0,6),(15,0),(721,6),(15,101),(True,6)]:
                with self.assertRaises(GenerationError):settings.update(dict(currentPassword='WKN%sy24',dailyMinutes=minutes,failedChanges=count))
            policy=settings.update(dict(currentPassword='WKN%sy24',newPassword='custom-test-password',dailyMinutes=20,failedChanges=8))
            self.assertEqual(policy,dict(scope='day',dailyMinutes=20,failedChanges=8))
            restored=AnalysisSettings(tmp);self.assertTrue(restored.verify('custom-test-password'));self.assertFalse(restored.verify('WKN%sy24'))
            text=(Path(tmp)/'analysis-settings.json').read_text();self.assertNotIn('custom-test-password',text)
            self.assertNotIn('passwordHash',restored.public())
            with self.assertRaises(GenerationError):authorize({'attempts':self.attempts(NOW)},restored,NOW)
            restored.update(dict(currentPassword='custom-test-password',dailyMinutes=10,failedChanges=4))
            self.assertEqual(authorize({'attempts':self.attempts(NOW)},restored,NOW),'practice')
    def attempts(self,now):return [dict(hash=hashlib.sha256(str(i).encode()).hexdigest(),status='WA',mode='judge',at=now-900000+i*180000) for i in range(6)]
    def test_gate_thresholds(self):
        now=NOW;events=self.attempts(now)
        with tempfile.TemporaryDirectory() as tmp:settings=AnalysisSettings(tmp)
        self.assertEqual(authorize({'attempts':events},settings,now),'practice')
        self.assertEqual(authorize({'password':'WKN%sy24'},settings,now),'password')
        for gate in [{},{'password':'bad'},{'attempts':events[:5]},{'attempts':[events[0]]*6},{'attempts':[{**e,'at':now} for e in events]},{'attempts':[{**e,'status':'OK'} for e in events]}]:
            with self.assertRaises(GenerationError):authorize(gate,settings,now)
        self.assertEqual(authorize({'attempts':events},settings,now+3600001),'practice')
        settings.value.update(dailyMinutes=1,failedChanges=1)
        single=[dict(hash='a'*64,status='PARTIAL',mode='judge',at=now-60000)]
        self.assertEqual(authorize({'attempts':single},settings,now),'practice')
        with self.assertRaises(GenerationError):authorize({'attempts':single},settings,now-1)
        with self.assertRaises(GenerationError):authorize({'attempts':events},settings,now+86400000)
        for mode in ['run',None]:
            with self.assertRaises(GenerationError):authorize({'attempts':[{**single[0],'mode':mode}]},settings,now)
    def test_model_line_validation_and_prompt(self):
        review={'summary':'检查输入边界','issues':[dict(line=2,endLine=2,severity='warning',title='可能越界',reason='输入为负时越界',suggestion='先验证范围')]}
        payload={'problem':{'id':'p'},'code':'int main(){\nreturn 0;\n}','input':''}
        with patch('learning_service.code_analysis.completion',return_value=review) as completion:
            result=analyze({'model':'test'},payload,lambda _:None)
        self.assertEqual(result['sourceHash'],hashlib.sha256(payload['code'].encode()).hexdigest())
        self.assertIn('2: return 0;',completion.call_args.args[2]['numberedCode'])
        self.assertEqual(completion.call_args.args[2]['lineCount'],3)
        self.assertEqual(completion.call_count,1)
        self.assertTrue(completion.call_args.kwargs['enable_thinking'])
        self.assertEqual(completion.call_args.kwargs['thinking_budget'],8192)
        self.assertTrue(result['thinking'])
        for line in [0,4,True,'2']:
            bad={**review,'issues':[{**review['issues'][0],'line':line}]}
            with self.assertRaises(GenerationError):validate_review(bad,3)
    def test_invalid_annotation_is_corrected_once_against_unchanged_snapshot(self):
        # A common failure is annotating line 86 of an 85-line source. Include an
        # earlier valid issue so recovery cannot silently discard partial feedback.
        payload={'problem':{'id':'p'},'code':'\n'.join(['// comment']*83+['return 0;','}']),'input':'2 5'}
        issue=dict(line=84,endLine=84,severity='warning',title='边界检查',reason='检查边界',suggestion='确认输入范围')
        bad=dict(summary='检查代码',issues=[{**issue,'line':1,'endLine':1},{**issue,'line':86,'endLine':86}])
        good=dict(summary='检查代码',issues=[bad['issues'][0],issue])
        progress=[]
        with patch('learning_service.code_analysis.completion',side_effect=[bad,good]) as completion:
            result=analyze({'model':'test'},payload,progress.append)
        self.assertEqual(result['issues'],good['issues'])
        self.assertEqual(result['sourceHash'],hashlib.sha256(payload['code'].encode()).hexdigest())
        first,second=completion.call_args_list
        for field in ['problem','numberedCode','input','lineCount']:
            self.assertEqual(first.args[2][field],second.args[2][field])
        self.assertEqual(second.args[2]['previousReview'],bad)
        self.assertIn('85',second.args[2]['validationError'])
        self.assertEqual(second.kwargs['attempts'],1)
        self.assertTrue(first.kwargs['enable_thinking'])
        self.assertTrue(second.kwargs['enable_thinking'])
        self.assertTrue(progress)
    def test_persistently_invalid_annotation_fails_without_clamping_or_retry_loop(self):
        payload={'problem':{'id':'p'},'code':'int main() {}','input':''}
        for start,end in [(0,1),(2,2),(1,0),('1',1),(True,1),(1,None)]:
            bad=dict(summary='检查代码',issues=[dict(line=start,endLine=end,severity='error',title='x',reason='x',suggestion='x')])
            with self.subTest(start=start,end=end),patch('learning_service.code_analysis.completion',return_value=bad) as completion:
                with self.assertRaises(GenerationError) as caught:analyze({'model':'test'},payload,lambda _:None)
                self.assertEqual(caught.exception.code,'analysis_format')
                self.assertEqual(completion.call_count,2)
    def test_upstream_failure_does_not_trigger_format_correction(self):
        with patch('learning_service.code_analysis.completion',side_effect=GenerationError('model_http','unavailable')) as completion:
            with self.assertRaises(GenerationError):analyze({'model':'test'},{'problem':{'id':'p'},'code':'int main() {}','input':''},lambda _:None)
            self.assertEqual(completion.call_count,1)
    def test_http_gate_and_secret_excluded_from_job_and_model(self):
        cfg={'key':'fixture','base':'http://127.0.0.1:1','model':'test','visionModel':'test','source':'test'}
        opener=build_opener(ProxyHandler({}))
        with tempfile.TemporaryDirectory() as tmp:
            app=Application(cfg,tmp);server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(app));threading.Thread(target=server.serve_forever,daemon=True).start()
            base=f'http://127.0.0.1:{server.server_port}'
            def post(body):
                req=Request(base+'/api/code-analysis',json.dumps(body).encode(),{'Content-Type':'application/json'})
                try:
                    with opener.open(req) as r:return r.status,json.loads(r.read())
                except HTTPError as e:return e.code,json.loads(e.read())
            body={'problem':{'id':'demo','title':'求和','description':'输出两数之和','level':1},'code':'int main(){return 0;}','input':'1 2'}
            try:
                self.assertEqual(post(body)[0],400)
                self.assertEqual(post({**body,'gate':{'password':'wrong'}})[0],400)
                self.assertEqual(post({**body,'code':'\n'*2001,'gate':{'password':'WKN%sy24'}})[0],400)
                with patch('learning_service.server.analyze_code',return_value={'summary':'ok','issues':[]}) as worker:
                    status,job=post({**body,'gate':{'password':'WKN%sy24'}});self.assertEqual(status,202)
                    for _ in range(100):
                        if app.jobs[job['id']]['status'] in ('completed','failed'):break
                        time.sleep(.01)
                    self.assertEqual(app.jobs[job['id']]['status'],'completed')
                    self.assertNotIn('gate',worker.call_args.args[1]);self.assertNotIn('WKN%sy24',json.dumps(app.jobs))
                    for file in Path(tmp).rglob('*.json'):self.assertNotIn('WKN%sy24',file.read_text(encoding='utf-8'))
            finally:server.shutdown();server.server_close();app.pool.shutdown(wait=True)

if __name__=='__main__':unittest.main()
