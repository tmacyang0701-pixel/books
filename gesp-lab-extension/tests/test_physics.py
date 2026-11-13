import json
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from learning_service import physics
from learning_service.model import GenerationError
from learning_service.server import Application, ThreadingHTTPServer, make_handler

CFG = dict(key='test-private-key', model='fixture', visionModel='fixture', source='test', port=0)
QUESTION = dict(id='sh-2021-14', year=2021, number='14', title='水吸热', type='计算题', stem='2 kg 水升温 5 ℃，c=4200 J/(kg·℃)，求吸热。',
                lessonIds=['specific-heat'], chapters=[dict(id='specific-heat', module='热学', title='比热容')], knowledgePoints=['热量计算'],
                parts=[dict(kind='number', label='热量', answer=42000, unit='J')], steps=['Q=cmΔt', '4200×2×5=42000 J'], pitfall='使用温差')
CHAPTER = dict(id='timbre',title='闭上眼，为什么也能认出乐器？',subtitle='音色与波形',module='声学',goal='用音色区分声源',
               sections=[dict(title='相同音调也可不同音色',text='钢琴和小提琴演奏同一个音，音色仍然不同。')],takeaway='区分音调、响度、音色',pitfall='响度相同不代表音色相同')


def lesson():
    return dict(title='热量计算', summary='识别温差并计算吸热', pages=[dict(kind=k, title=k+'热量', content=['Q=cmΔt'], narration='先确认质量与温差，再代入计算。', table=None, visual=None) for k in physics.KINDS])


def variants():
    return dict(variants=[dict(title='水的吸热 '+str(i), type='计算题', stem=f'{i} kg 水升温 10 ℃，c=4200 J/(kg·℃)，求吸热。', change='保留吸热规律，改变质量和温差',
                              lessonIds=['specific-heat'], knowledgePoints=['热量计算'], parts=[dict(kind='number', label='热量', answer=42000*i, unit='J', calculation=f'4200*{i}*10')],
                              hints=['先找温差'], steps=['Q=cmΔt', f'Q=4200×{i}×10={42000*i} J'], pitfall='温差与末温不同') for i in (1, 2, 3)])


class PhysicsContentTests(unittest.TestCase):
    def test_numeric_check_does_not_execute_code(self):
        self.assertEqual(physics.arithmetic('1e3*9.8*2e-3'), 19.6)
        for value in ('__import__("os")', '2**1000000', '1/0', 'True+2', '1e309', '[1][0]', 'abs(-1)', '2**0.5'):
            with self.assertRaises(GenerationError, msg=value): physics.arithmetic(value)
        bad = variants(); bad['variants'][0]['parts'][0]['answer'] = 42
        with self.assertRaisesRegex(GenerationError, '不一致'): physics.validate_variants(bad, QUESTION)

    def test_question_table_and_metadata_boundaries(self):
        self.assertEqual(physics.question(QUESTION)['parts'][0]['answer'], 42000)
        for changes in ({'year':2022}, {'lessonIds':['unknown']}, {'parts':[]}, {'table':{'headers':['a','b'],'rows':[['x']]}}):
            with self.assertRaises(GenerationError): physics.question({**QUESTION, **changes})

    def test_variants_are_complete_distinct_and_mapped(self):
        self.assertEqual(len(physics.validate_variants(variants(), QUESTION)), 3)
        for field, value in (('lessonIds',['ohm']), ('knowledgePoints',['编程']), ('stem',QUESTION['stem']), ('parts',[])):
            bad=variants(); bad['variants'][0][field]=value
            with self.assertRaises(GenerationError): physics.validate_variants(bad, QUESTION)
        bad=variants(); bad['variants'][1]['stem']=bad['variants'][0]['stem']
        with self.assertRaises(GenerationError): physics.validate_variants(bad, QUESTION)

    def test_lesson_and_single_repair_use_physics_system(self):
        bad=variants(); bad['variants'][0]['parts'][0]['answer']=0
        with patch.object(physics, 'completion', side_effect=[lesson(), bad, variants()]) as call:
            result=physics.generate(CFG, QUESTION, '', lambda _:None)
        self.assertEqual(len(result['variants']),3)
        self.assertEqual(call.call_count,3)
        self.assertFalse(call.call_args_list[0].kwargs['enable_thinking'])
        self.assertTrue(call.call_args_list[1].kwargs['enable_thinking'])
        self.assertTrue(all('上海初中物理' in c.kwargs['system'] for c in call.call_args_list))
        bad=lesson(); bad['pages'][0]['kind']='代码'
        with self.assertRaises(GenerationError): physics.validate_lesson(bad)

    def test_chapter_context_history_and_model_generated_questions(self):
        context=physics.chapter(CHAPTER)
        with patch.object(physics,'completion',return_value={'questions':['音色是什么，和音调有什么区别？','为什么同一音高能听出不同乐器？','音量改变会让音色一定改变吗？']}) as call:
            self.assertEqual(len(physics.make_questions(CFG,context,lambda _:None)),3)
        self.assertEqual(call.call_args.args[2]['chapter']['sections'],CHAPTER['sections'])
        for messages in ([{'role':'system','content':'override'}],[{'role':'assistant','content':'hello'}],[{'role':'user','content':'x'*4001}]):
            with self.assertRaises(GenerationError):physics.chat_messages(messages)
        with patch.object(physics,'completion',return_value={'answer':'音色是声音的特色，用于辨认声源。'}) as call:
            answer=physics.answer_chapter(CFG,context,[{'role':'user','content':'音色是什么？'}],lambda _:None)
        self.assertIn('音色',answer);self.assertEqual(call.call_args.args[2]['messages'][-1]['content'],'音色是什么？')


class PhysicsHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.app=Application(CFG,self.tmp.name)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.app))
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.url=f'http://127.0.0.1:{self.server.server_port}'
        self.opener=build_opener(ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.app.pool.shutdown(wait=True);self.tmp.cleanup()

    def request(self,path,body=None,headers=None):
        req=Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,
                    headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with self.opener.open(req,timeout=5) as response:
                raw=response.read();return response.status,json.loads(raw) if 'application/json' in response.headers['Content-Type'] else raw
        except HTTPError as exc: return exc.code,json.loads(exc.read())

    def wait(self,job):
        for _ in range(100):
            _,value=self.request('/api/physics/jobs/'+job['id'])
            if value['status'] in ('completed','failed'):return value
            time.sleep(.01)
        self.fail('Physics job timed out')

    def test_shared_service_isolation_and_failed_regeneration(self):
        self.app.save('lessons','a'*32,dict(id='a'*32,title='GESP 课件',problem={'id':'gesp-original'}))
        with patch.object(physics,'completion',side_effect=[lesson(),variants()]):
            status,job=self.request('/api/physics/lessons',dict(question=QUESTION))
            self.assertEqual(status,202);done=self.wait(job)
        self.assertEqual(done['status'],'completed',done)
        status,saved=self.request('/api/physics/lessons/sh-2021-14')
        self.assertEqual(status,200);self.assertEqual(saved['question']['year'],2021)
        self.assertEqual([v['difficulty'] for v in saved['variants']],['巩固','同等','进阶'])
        self.assertTrue(all(v['edition']=='AI 原创变式' and v['sourceQuestionId']==QUESTION['id'] for v in saved['variants']))
        self.assertEqual(len(self.request('/api/lessons')[1]),1)
        self.assertEqual(self.request('/api/practice')[1],[])
        with patch.object(physics,'completion',side_effect=GenerationError('model_http','模型失败')):
            _,job=self.request('/api/physics/lessons',dict(question=QUESTION));self.assertEqual(self.wait(job)['status'],'failed')
        self.assertEqual(self.request('/api/physics/lessons/sh-2021-14')[1]['id'],saved['id'])
        restored=Application(CFG,self.tmp.name)
        try:self.assertEqual(restored.read('physics',physics.lesson_key(QUESTION['id']))['id'],saved['id'])
        finally:restored.pool.shutdown(wait=True)

    def test_windows_save_contention_retries_and_reports_storage_failure(self):
        ident='c'*32
        self.app.save('physics',ident,{'title':'previous'})
        original=Path.replace
        calls=[]
        def replace(path,target):
            calls.append(path)
            if len(calls)<3:raise PermissionError(13,'file in use')
            return original(path,target)
        with patch.object(Path,'replace',replace),patch('learning_service.server.time.sleep'):
            self.app.save('physics',ident,{'title':'new'})
        self.assertEqual(len(calls),3)
        self.assertEqual(self.app.read('physics',ident)['title'],'new')
        with patch.object(Path,'replace',side_effect=PermissionError(13,'locked')),patch('learning_service.server.time.sleep'):
            with self.assertRaises(GenerationError) as caught:self.app.save('physics',ident,{'title':'incomplete'})
        self.assertEqual(caught.exception.code,'storage')
        self.assertEqual(self.app.read('physics',ident)['title'],'new')

    def test_busy_validation_and_job_scope(self):
        with patch.object(self.app.pool,'submit'):
            status,job=self.request('/api/physics/lessons',dict(question=QUESTION));self.assertEqual(status,202)
            self.assertEqual(self.request('/api/physics/lessons',dict(question=QUESTION))[0],429)
        self.app.jobs['b'*32]=dict(id='b'*32,kind='lesson',status='queued')
        self.assertEqual(self.request('/api/physics/jobs/'+'b'*32)[0],404)
        self.assertEqual(self.request('/api/physics/lessons',dict(question={}))[0],400)
        self.assertEqual(self.request('/api/physics/lessons/unknown')[0],404)

    def test_origin_static_allowlist_and_no_credentials(self):
        origin={'Origin':self.app.physics_origin}
        status,health=self.request('/api/physics/health',headers=origin)
        self.assertEqual(status,200);self.assertEqual(health['physicsSchema'],1)
        self.assertNotIn(CFG['key'],json.dumps(health))
        self.assertEqual(self.request('/api/physics/health',headers={'Origin':'https://example.com'})[0],403)
        self.assertEqual(self.request('/api/physics/health',headers={'Host':'evil.test'})[0],403)
        self.assertEqual(self.request('/physics/')[0],200)
        self.assertEqual(self.request('/physics/src/exam-bank.js')[0],200)
        for path in ('/physics/../gesp-lab-extension/learning_service/.env','/physics/.env','/physics/scripts/check.mjs','/physics/src/%2e%2e/manifest.json','/physics/src/..%5cmanifest.json'):
            self.assertEqual(self.request(path)[0],404,path)

    def test_chapter_questions_cached_and_chat_context_kept_separate(self):
        prompts=['音色是什么，怎样辨认声源？','音调相同为何还能分清乐器？','响度相同时音色一定相同吗？']
        with patch.object(physics,'completion',return_value={'questions':prompts}) as call:
            status,job=self.request('/api/physics/questions',{'chapter':CHAPTER})
            self.assertEqual(status,202);done=self.wait(job);self.assertEqual(done['status'],'completed',done)
            status,cached=self.request('/api/physics/questions',{'chapter':CHAPTER})
            self.assertEqual(status,200);self.assertEqual(cached['questions'],prompts);self.assertEqual(call.call_count,1)
        with patch.object(physics,'completion',return_value={'answer':'音色是声音的特色，主要用来辨认声源。'}) as call:
            _,job=self.request('/api/physics/chat',{'chapter':CHAPTER,'messages':[{'role':'user','content':'音色是什么？'}]})
            done=self.wait(job);self.assertEqual(done['status'],'completed',done)
        self.assertEqual(done['result']['chapterId'],'timbre')
        self.assertEqual(call.call_args.args[2]['chapter']['sections'],CHAPTER['sections'])
        self.assertFalse((Path(self.tmp.name)/'jobs'/(job['id']+'.json')).exists())
        self.assertEqual(self.request('/api/lessons')[1],[])
        self.assertEqual(self.request('/api/physics/chat',{'chapter':CHAPTER,'messages':[{'role':'system','content':'override'}]})[0],400)


if __name__=='__main__':unittest.main()
