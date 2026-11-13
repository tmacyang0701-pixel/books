import tempfile
import threading
import unittest
from unittest.mock import patch
from pathlib import Path
import test_learning as fixtures
from learning_service.server import Application, ThreadingHTTPServer, make_handler
from learning_service.model import make_run_case, normalize_run_case, GenerationError, RUN_CASE_SYSTEM

class RunCaseTests(unittest.TestCase):
    request=fixtures.LearningTests.request
    wait=fixtures.LearningTests.wait
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=fixtures.ROOT/'.tmp',prefix='run-case-')
        self.app=Application(fixtures.CFG,self.temp.name);self.ident='e'*32
        self.lesson=dict(id=self.ident,problem=dict(id='test-problem',title='相加',description='输出 a+b',constraints='1 <= a,b <= 10'),pages=[dict(code='int main(){}'),dict(code='')])
        self.app.save('lessons',self.ident,self.lesson)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.app));threading.Thread(target=self.server.serve_forever,daemon=True).start();self.url=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):self.server.shutdown();self.server.server_close();self.app.pool.shutdown(wait=True);self.temp.cleanup()
    def test_generation_uses_saved_original_constraints(self):
        result=dict(input='3 4',expected='7',explanation='普通相加')
        with patch('learning_service.model.completion',return_value=result) as completion:
            status,job=self.request('/api/run-cases',dict(lessonId=self.ident,pageIndex=0,currentInput='1 2',problem={'description':'SPOOFED'}))
            self.assertEqual(status,202);done=self.wait(job);self.assertEqual(done['status'],'completed',done)
            self.assertEqual(done['result'],dict(lessonId=self.ident,pageIndex=0,**result))
            self.assertEqual(completion.call_args.args[2]['problem'],self.lesson['problem'])
            self.assertNotIn('SPOOFED',str(completion.call_args))
            self.assertEqual(completion.call_args.kwargs['system'],RUN_CASE_SYSTEM)
    def test_common_response_formats_keep_input_output_and_bound_explanation(self):
        expected=dict(input='3 4',expected='7',explanation='相加')
        for response in [dict(stdin='3 4',stdout='7',reason='相加'),dict(testCase=dict(input='3 4',output='7',explanation='相加')),dict(cases=[dict(input='```text\n3 4\n```',expectedOutput='7',description='相加')])]:
            self.assertEqual(normalize_run_case(response,'1 2'),expected)
        value=normalize_run_case(dict(input='3 4',expected='7',explanation='说明'*600),'1 2')
        self.assertLessEqual(len(value['explanation']),1000)
        self.assertTrue(normalize_run_case(dict(input='3 4',expected='7'),'1 2')['explanation'])
    def test_invalid_structure_is_repaired_once_and_duplicate_data_rejected(self):
        good=dict(input='3 4',expected='7',explanation='相加')
        with patch('learning_service.model.completion',side_effect=[dict(pages=[]),good]) as completion:
            self.assertEqual(make_run_case(fixtures.CFG,self.lesson,'1 2',lambda _:None),good)
            self.assertEqual(completion.call_count,2)
            self.assertIn('correction',completion.call_args.args[2])
        with patch('learning_service.model.completion',return_value=dict(input='1  2\n',expected='3')) as completion:
            with self.assertRaises(GenerationError):make_run_case(fixtures.CFG,self.lesson,'1 2',lambda _:None)
            self.assertEqual(completion.call_count,2)
        with patch('learning_service.model.completion',side_effect=[dict(input='3 4',expected='6',explanation='3+4=7。我将修正expected为7。'),good]) as completion:
            self.assertEqual(make_run_case(fixtures.CFG,self.lesson,'1 2',lambda _:None),good)
            self.assertEqual(completion.call_count,2)
    def test_invalid_pages_inputs_and_model_results(self):
        for change in [dict(pageIndex=1),dict(pageIndex=True),dict(currentInput=[]),dict(currentInput='a'*20001)]:
            status,_=self.request('/api/run-cases',dict(lessonId=self.ident,pageIndex=0,currentInput='1 2')|change);self.assertEqual(status,400)
        for result in [{},dict(input='1 2',expected='3',explanation='duplicate'),dict(input='3 4',expected=7,explanation='invalid')]:
            with patch('learning_service.model.completion',return_value=result):
                with self.assertRaises(GenerationError):make_run_case(fixtures.CFG,self.lesson,'1 2',lambda _:None)
    def test_http_stream_success_and_failures_do_not_publish_invalid_case(self):
        for mode,expected in [('success','completed'),('unauthorized','failed'),('invalid-structure','failed'),('incomplete','failed')]:
            status,job=self.request('/api/run-cases',dict(lessonId=self.ident,pageIndex=0,currentInput='SIMULATE:'+mode))
            self.assertEqual(status,202);done=self.wait(job);self.assertEqual(done['status'],expected,done)
            if expected=='completed':self.assertEqual(done['result']['input'],'3 4')
            else:self.assertNotIn('result',done)
