import tempfile,threading,unittest
import test_learning as fixtures
from learning_service.server import Application,ThreadingHTTPServer,make_handler

class TopicHttpTests(unittest.TestCase):
    request=fixtures.LearningTests.request
    wait=fixtures.LearningTests.wait
    def test_null_table_topic_persists_and_bad_regeneration_preserves_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.app=Application(fixtures.CFG,tmp)
            server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.app))
            threading.Thread(target=server.serve_forever,daemon=True).start();self.url=f'http://127.0.0.1:{server.server_port}'
            body=dict(problem=dict(id='knowledge-5-linked-list',kind='knowledge-topic',level=5,title='链表',description='讲原理和语法',tags=['链表']),targetLevel=5)
            try:
                status,job=self.request('/api/lessons',body);self.assertEqual(status,202)
                done=self.wait(job);self.assertEqual(done['status'],'completed',done)
                ident=done['result']['lessonId'];status,lesson=self.request('/api/lessons/'+ident)
                self.assertEqual(status,200);self.assertEqual(lesson['topicSchema'],2);self.assertEqual(lesson['targetLevel'],5)
                self.assertEqual(lesson['pages'][1]['trace'],dict(headers=[],rows=[]));self.assertEqual(lesson['pages'][1]['lab']['expectedOutput'],'2')
                _,retry=self.request('/api/lessons',{**body,'requirements':'SIMULATE:old-topic-structure'})
                self.assertEqual(self.wait(retry)['status'],'failed')
                self.assertEqual(self.request('/api/lessons')[1][0]['id'],ident)
            finally:server.shutdown();server.server_close();self.app.pool.shutdown(wait=True)
