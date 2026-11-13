import base64
import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from learning_service.model import GenerationError, completion, validate_lesson
from learning_service.server import Application, ThreadingHTTPServer, make_handler, normalize_problem

MOCK=os.environ.get('CODEARENA_TEST_QWEN','http://127.0.0.1:4877/compatible-mode/v1')
CFG=dict(key='test-only-not-a-real-credential',base=MOCK,model='qwen3.8-max',visionModel='qwen3-vl-plus',timeout=3,source='test fixture',port=0)
OPENER=build_opener(ProxyHandler({}))


class LearningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(dir=ROOT/'.tmp',prefix='service-test-')
        cls.app=Application(CFG,cls.temp.name)
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(cls.app))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}'
        cls.problem=json.loads((ROOT/'data/gesp/level-5/gesp-2023-09-5-1.json').read_text(encoding='utf-8'))

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.app.pool.shutdown(wait=True);cls.temp.cleanup()

    def request(self,path,body=None,headers=None):
        req=Request(self.url+path,data=None if body is None else json.dumps(body).encode(),headers=headers or ({'Content-Type':'application/json'} if body is not None else {}))
        try:
            with OPENER.open(req,timeout=5) as r:return r.status,json.loads(r.read())
        except HTTPError as e:return e.code,json.loads(e.read())

    def wait(self,job):
        for _ in range(180):
            status,value=self.request('/api/jobs/'+job['id'])
            if value['status'] in ('completed','failed'):return value
            time.sleep(.05)
        self.fail('Job did not complete')

    def test_health_no_secret_and_origin_protection(self):
        status,data=self.request('/api/health');self.assertEqual(status,200);self.assertNotIn(CFG['key'],json.dumps(data))
        self.assertEqual(data['processId'],os.getpid());self.assertEqual(data['instancePath'],str(ROOT));self.assertEqual(data['version'],12)
        self.assertEqual(self.request('/api/health',headers={'Origin':'https://example.com'})[0],403)
        self.assertEqual(self.request('/api/health',headers={'Host':'evil.test'})[0],403)

    def test_private_files_and_traversal_are_not_served(self):
        for path in ('/learning_service/config.json','/.env','/.local/jobs/a.json','/data/gesp/../../learning_service/config.json','/data/gesp/%2e%2e/%2e%2e/learning_service/config.json','/data/gesp/..%5c..%5clearning_service/config.json','/api/lessons/../../secret'):
            self.assertEqual(self.request(path)[0],404,path)

    def test_input_validation(self):
        for level in (0,9,True,'5'):
            self.assertEqual(self.request('/api/lessons',{'problem':self.problem,'targetLevel':level})[0],400)
        self.assertEqual(self.request('/api/lessons',{'problem':{'title':'bad'}})[0],400)
        self.assertEqual(self.request('/api/imports',{'filename':'x.exe','contentBase64':'AA=='})[0],400)
        self.assertEqual(self.request('/api/imports',{'filename':'x.png','contentBase64':'???'})[0],400)

    def test_lesson_and_practice_round_trip(self):
        status,job=self.request('/api/lessons',{'problem':self.problem,'targetLevel':5})
        self.assertEqual(status,202);done=self.wait(job);self.assertEqual(done['status'],'completed',done)
        lesson_id=done['result']['lessonId'];status,lesson=self.request('/api/lessons/'+lesson_id)
        self.assertEqual(status,200);self.assertEqual(len(lesson['pages']),8);self.assertEqual(lesson['model'],'qwen3.8-max')
        self.assertTrue(lesson['recommendations']);self.assertNotIn(self.problem['id'],[r['id'] for r in lesson['recommendations']])
        self.assertTrue(any(l['id']==lesson_id for l in self.request('/api/lessons')[1]))
        status,job=self.request('/api/practice',{'lessonId':lesson_id});done=self.wait(job)
        self.assertEqual(done['status'],'completed',done);self.assertEqual(len(done['result']['problems']),3)
        self.assertTrue(all(p['kind']=='generated' for p in done['result']['problems']))
        self.assertEqual(len(self.request('/api/practice')[1][-1]['problems']),3)

    def test_optional_page_questions_preserve_valid_lesson_and_filter_bad_entries(self):
        result=completion(CFG,'Return JSON',{})
        result['pages'][0]['questions']=['为什么从最小因子开始？','为什么从最小因子开始？',42,'x','a'*81,'何时停止试除？']
        result['pages'][1]['questions']='invalid'
        validate_lesson(result)
        self.assertEqual(result['pages'][0]['questions'],['为什么从最小因子开始？','何时停止试除？'])
        self.assertEqual(result['pages'][1]['questions'],[])
        self.assertEqual(result['pages'][2]['questions'],[])
        self.assertEqual(len(result['pages']),8)

    def test_json_and_text_uploads_preserve_content(self):
        for filename,content in [('题目.json',json.dumps(self.problem).encode()),('求和.txt','读入两个整数，输出它们的和。'.encode())]:
            status,job=self.request('/api/imports',{'filename':filename,'contentBase64':base64.b64encode(content).decode(),'level':5})
            self.assertEqual(status,202);done=self.wait(job);self.assertEqual(done['status'],'completed',done)
            self.assertEqual(done['result']['problem']['kind'],'uploaded')

    def test_invalid_json_file_fails_without_publication(self):
        _,job=self.request('/api/imports',{'filename':'bad.json','contentBase64':base64.b64encode(b'{oops').decode()})
        done=self.wait(job);self.assertEqual(done['status'],'failed');self.assertEqual(done['error']['code'],'invalid_file')

    def test_pdf_text_and_scanned_pdf_handling(self):
        import fitz
        for text in ('Given two integers a and b, output their sum. Input: a b. Output: a+b.', ''):
            doc=fitz.open();page=doc.new_page()
            if text:page.insert_text((72,72),text)
            encoded=base64.b64encode(doc.tobytes()).decode();doc.close()
            _,job=self.request('/api/imports',{'filename':'one-question.pdf','contentBase64':encoded})
            done=self.wait(job)
            if text:self.assertEqual(done['status'],'completed',done)
            else:self.assertEqual(done['error']['code'],'scanned_pdf')

    def test_image_recognition_path(self):
        # Signature check and model routing. Fixture bytes are never treated as a real photograph.
        _,job=self.request('/api/imports',{'filename':'test.png','contentBase64':base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode()})
        done=self.wait(job);self.assertEqual(done['status'],'completed',done)
        self.assertEqual(done['result']['problem']['title'],'测试变式：两数之和')

    def test_failed_model_jobs_never_publish_lessons(self):
        before=len(self.app.list_records('lessons'))
        for mode in ('unauthorized','incomplete','invalid-json','invalid-structure'):
            _,job=self.request('/api/lessons',{'problem':self.problem,'targetLevel':5,'requirements':'SIMULATE:'+mode})
            done=self.wait(job);self.assertEqual(done['status'],'failed',mode)
        self.assertEqual(len(self.app.list_records('lessons')),before)

    def test_transient_retry_and_json_gateway(self):
        for mode in ('retry503','json-gateway'):
            result=completion(CFG,'Return JSON',{'test':'SIMULATE:'+mode},attempts=2)
            self.assertEqual(result['title'],'测试课件：因数分解')

    def test_timeout_and_missing_key(self):
        with self.assertRaises(GenerationError) as ctx:completion({**CFG,'timeout':1},'JSON',{'test':'SIMULATE:timeout'},attempts=1)
        self.assertEqual(ctx.exception.code,'connection')
        with self.assertRaises(GenerationError) as ctx:completion({**CFG,'key':''},'JSON',{})
        self.assertEqual(ctx.exception.code,'not_configured')

    def test_optional_page_examples_are_bounded_and_preserve_valid_content(self):
        lesson=completion(CFG,'Return JSON',{'test':'SIMULATE:success'})
        page=lesson['pages'][0]
        page['useOriginalSample']='false'
        page['examples']=[dict(title='小例子',input='1 2',output='3',explanation='相加',visual={'type':'script'}),dict(title='缺少输出',input='1')]
        validate_lesson(lesson)
        self.assertNotIn('useOriginalSample',page)
        self.assertEqual(len(page['examples']),1)
        self.assertIsNone(page['examples'][0]['visual'])
        page['useOriginalSample']=False;validate_lesson(lesson)
        self.assertIs(page['useOriginalSample'],False)

    def test_interrupted_jobs_recover_as_failed(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'.tmp') as temp:
            data=Path(temp);(data/'jobs').mkdir();ident='a'*32
            (data/'jobs'/f'{ident}.json').write_text(json.dumps({'id':ident,'status':'running'}))
            app=Application(CFG,data);self.assertEqual(app.jobs[ident]['status'],'failed');app.pool.shutdown()

    def test_bank_example_answers_independently_checked(self):
        expected={'B3871':'2^3 * 3^2','B3872':'75','B3929':'4\nlucky\n8\nlucky','B3930':'10','B3968':'2\n2\n1\n4',
                  'B3969':'10','P10719':'4','P10720':'1\n0\n0\n1','B4050':'1\n1\n2\n4\n3','B4051':'12',
                  'B4070':'3','B4071':'1','P11960':'30','P11961':'Yes\nNo\nYes','P13013':'4','P13014':'1\n4\n1\n2',
                  'P14073':'5','P14074':'22','P14917':'1','P14918':'2','P15798':'5','P15799':'2','P17010':'20','P17011':'22','P17455':'2','P17456':'4.000'}
        from scripts.build_question_bank import ROWS
        for row in ROWS:
            p=json.loads((ROOT/f'data/gesp/level-5/gesp-{row[0]}-5-{row[1]}.json').read_text(encoding='utf-8'))
            self.assertEqual(p['sampleOutput'].strip(),expected[row[2]],row[2])


if __name__=='__main__':unittest.main(verbosity=2)
