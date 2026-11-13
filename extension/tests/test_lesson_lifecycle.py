import copy
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request
from urllib.error import HTTPError
import test_learning as fixtures
from learning_service.server import Application, ThreadingHTTPServer, make_handler, problem_key
from learning_service.model import GenerationError, normalize_visual


class LessonLifecycleTests(unittest.TestCase):
    request=fixtures.LearningTests.request
    wait=fixtures.LearningTests.wait

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=fixtures.ROOT/'.tmp',prefix='lifecycle-')
        self.app=Application(fixtures.CFG,self.temp.name)
        self.problem=json.loads((fixtures.ROOT/'data/gesp/level-5/gesp-2023-09-5-1.json').read_text(encoding='utf-8'))
        self.old=dict(id='a'*32,title='Existing lesson',createdAt=1,targetLevel=5,problem=self.problem,pages=[])
        self.app.save('lessons',self.old['id'],self.old)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.app))
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.url=f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.app.pool.shutdown(wait=True);self.temp.cleanup()

    def test_successful_regeneration_replaces_only_its_problem(self):
        other={**self.old,'id':'b'*32,'problem':{**self.problem,'id':'another'}}
        self.app.save('lessons',other['id'],other)
        _,job=self.request('/api/lessons',dict(problem=self.problem,targetLevel=5))
        done=self.wait(job);self.assertEqual(done['status'],'completed',done)
        ids=[v['id'] for v in self.request('/api/lessons')[1]]
        self.assertEqual(set(ids),{job['id'],other['id']})
        self.assertTrue((Path(self.temp.name)/'lesson-archive'/(self.old['id']+'.json')).is_file())

    def test_failed_regeneration_keeps_existing_lesson(self):
        _,job=self.request('/api/lessons',dict(problem=self.problem,targetLevel=5,requirements='SIMULATE:invalid-structure'))
        self.assertEqual(self.wait(job)['status'],'failed')
        self.assertEqual(self.request('/api/lessons')[1][0]['id'],self.old['id'])
        self.assertEqual(self.app.read('lessons',self.old['id']),self.old)

    def test_delete_is_origin_checked_and_keeps_original_problem(self):
        url=self.url+'/api/lessons/'+self.old['id']
        with self.assertRaises(HTTPError) as exc:fixtures.OPENER.open(Request(url,method='DELETE',headers={'Origin':'https://example.com'}))
        self.assertEqual(exc.exception.code,403)
        with fixtures.OPENER.open(Request(url,method='DELETE')) as response:self.assertTrue(json.load(response)['deleted'])
        self.assertEqual(self.request('/api/lessons')[1],[])
        self.assertEqual(self.request('/api/lessons/'+self.old['id'])[0],404)
        self.assertTrue(any(p['id']==self.problem['id'] for p in self.app.bank))

    def test_startup_archives_duplicate_versions_but_keeps_latest(self):
        latest={**self.old,'id':'b'*32,'createdAt':2}
        self.app.save('lessons',latest['id'],latest)
        self.app.deduplicate_lessons()
        self.assertEqual([v['id'] for v in self.app.list_records('lessons')],[latest['id']])

    def test_parallel_regeneration_and_delete_are_blocked_for_that_question(self):
        self.app.jobs['c'*32]=dict(id='c'*32,kind='lesson',status='completed',problemId='another')
        with patch.object(self.app.pool,'submit'):
            queued=self.app.enqueue('lesson',dict(problem=self.problem,targetLevel=5))
            self.assertEqual(queued['problemId'],self.problem['id'])
            with self.assertRaises(GenerationError) as exc:self.app.enqueue('lesson',dict(problem=self.problem,targetLevel=5))
            self.assertEqual(exc.exception.code,'busy')
            with self.assertRaises(GenerationError):self.app.delete_lesson(self.old['id'])


class VisualSchemaTests(unittest.TestCase):
    def test_valid_visual_and_unknown_fields_are_not_executed(self):
        value=dict(type='flow',title='Flow',nodes=[dict(id='a',label='Read'),dict(id='b',label='Write')],edges=[{'from':'a','to':'b'}],frames=[dict(caption='Next',active=['b'],values={'b':'42'})],script='never copy')
        clean=normalize_visual(value)
        self.assertNotIn('script',clean);self.assertEqual(clean['frames'][0]['values'],{'b':'42'})

    def test_invalid_or_oversized_visuals_are_rejected(self):
        base=dict(type='grid',title='test',nodes=[dict(id='a',label='1')],frames=[])
        for value in ({**base,'nodes':base['nodes']*41},{**base,'frames':[dict(active=['missing'])]},{**base,'type':'javascript'},{**base,'nodes':[dict(id='x"',label='x')]}):
            with self.assertRaises((ValueError,TypeError)):normalize_visual(value)

    def test_question_identity_is_stable_without_an_explicit_id(self):
        self.assertEqual(problem_key({'title':'A','description':'B'}),problem_key({'description':'B','title':'A','cases':[]}))
        self.assertNotEqual(problem_key({'title':'A','description':'B'}),problem_key({'title':'A','description':'C'}))


if __name__=='__main__':unittest.main()
