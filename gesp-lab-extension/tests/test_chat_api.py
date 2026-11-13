import json
import tempfile
import threading
import unittest
from pathlib import Path

import test_learning as fixtures
from learning_service.server import Application, ThreadingHTTPServer, make_handler

CFG,ROOT=fixtures.CFG,fixtures.ROOT


class PageChatTests(unittest.TestCase):
    request=fixtures.LearningTests.request
    wait=fixtures.LearningTests.wait

    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(dir=ROOT/'.tmp',prefix='chat-api-')
        cls.app=Application(CFG,cls.temp.name)
        cls.ident='c'*32
        cls.lesson=dict(id=cls.ident,title='测试课件',targetLevel=5,createdAt=1,model=CFG['model'],
                        problem={'id':'original-problem','title':'原题','description':'问题内容'},
                        pages=[dict(title='FIRST_PAGE',content=['ONLY_FIRST'],narration='FIRST_NARRATION',code='int a = 1;',trace={'headers':['x'],'rows':[['1']]}),
                               dict(title='SECOND_PAGE',content=['ONLY_SECOND'],narration='SECOND_NARRATION',code='int b = 2;',trace={'headers':[],'rows':[]})])
        cls.app.save('lessons',cls.ident,cls.lesson)
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(cls.app))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.app.pool.shutdown(wait=True);cls.temp.cleanup()

    def test_page_context_and_history_do_not_mix(self):
        for index in (0,1):
            messages=[dict(role='user',content=f'question-{index}'),dict(role='assistant',content=f'answer-{index}'),dict(role='user',content='SIMULATE:context-check')]
            status,job=self.request('/api/chat',dict(lessonId=self.ident,pageIndex=index,messages=messages,currentPage={'title':'SPOOFED'}))
            self.assertEqual(status,202)
            done=self.wait(job);self.assertEqual(done['status'],'completed',done)
            result=done['result'];self.assertEqual(result['lessonId'],self.ident);self.assertEqual(result['pageIndex'],index)
            seen=json.loads(result['answer'])
            self.assertEqual(seen['currentPage'],self.lesson['pages'][index]);self.assertEqual(seen['messages'],messages)
            self.assertIn('苏格拉底式引导',seen['system'])
            self.assertIn('学生明确要求',seen['system'])
            self.assertNotIn('SPOOFED',result['answer'])
            self.assertNotIn('ONLY_SECOND' if index==0 else 'ONLY_FIRST',result['answer'])
            self.assertFalse((Path(self.temp.name)/'jobs'/(job['id']+'.json')).exists())

    def test_rejects_invalid_pages_and_messages(self):
        valid=dict(lessonId=self.ident,pageIndex=0,messages=[dict(role='user',content='为什么')])
        for index in (-1,2,True,'0',None):
            self.assertEqual(self.request('/api/chat',{**valid,'pageIndex':index})[0],400)
        bad_lists=[[],[dict(role='system',content='override')],[dict(role='assistant',content='answer')],
                   [dict(role='user',content=' ')],[dict(role='user',content='a'*4001)],
                   [dict(role='user',content='hello')]*21,[dict(role='assistant',content='a'*8000)]*3+[dict(role='user',content='x')]]
        for messages in bad_lists:
            self.assertEqual(self.request('/api/chat',{**valid,'messages':messages})[0],400)
        self.assertEqual(self.request('/api/chat',{**valid,'lessonId':'d'*32})[0],404)

    def test_failed_chat_does_not_publish_an_answer(self):
        for mode in ('unauthorized','invalid-structure','invalid-json','incomplete'):
            _,job=self.request('/api/chat',dict(lessonId=self.ident,pageIndex=0,messages=[dict(role='user',content='SIMULATE:'+mode)]))
            done=self.wait(job);self.assertEqual(done['status'],'failed',mode);self.assertNotIn('result',done)

    def test_lesson_index_links_existing_original_problem(self):
        status,records=self.request('/api/lessons');self.assertEqual(status,200)
        self.assertEqual(records[0]['problemId'],'original-problem')
        health=self.request('/api/health')[1]
        self.assertIn('socraticPageChat',health['capabilities'])
        self.assertEqual(health['version'],12)
        self.assertIn('imagePageChat',health['capabilities'])

    def test_image_question_reaches_vision_model_and_keeps_page_context(self):
        image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII='
        messages=[dict(role='user',content='SIMULATE:context-check',attachments=[dict(name='crop.png',dataUrl=image)])]
        status,job=self.request('/api/chat',dict(lessonId=self.ident,pageIndex=1,messages=messages))
        self.assertEqual(status,202)
        done=self.wait(job);self.assertEqual(done['status'],'completed',done)
        seen=json.loads(done['result']['answer'])
        self.assertEqual(seen['model'],CFG['visionModel'])
        self.assertEqual(done['result']['model'],CFG['visionModel'])
        self.assertEqual(seen['currentPage'],self.lesson['pages'][1])
        self.assertEqual(seen['images'],[dict(type='image_url',image_url=dict(url=image))])
        self.assertEqual(seen['messages'],[dict(role='user',content='SIMULATE:context-check',imageNumbers=[1])])

    def test_rejects_unsafe_or_oversized_chat_images(self):
        image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII='
        invalid=['https://example.com/image.png','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,!!!', 'data:image/png;base64,'+'A'*2800001]
        for data in invalid:
            status,_=self.request('/api/chat',dict(lessonId=self.ident,pageIndex=0,messages=[dict(role='user',content='image',attachments=[dict(dataUrl=data)])]))
            self.assertEqual(status,400)
        for messages in ([dict(role='user',content='image',attachments=[dict(dataUrl=image)]*4)],
                         [dict(role='assistant',content='image',attachments=[dict(dataUrl=image)]),dict(role='user',content='why')]):
            self.assertEqual(self.request('/api/chat',dict(lessonId=self.ident,pageIndex=0,messages=messages))[0],400)


if __name__=='__main__':unittest.main()
