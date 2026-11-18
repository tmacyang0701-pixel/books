import copy,json,sys,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request,build_opener,ProxyHandler
from urllib.error import HTTPError
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from learning_service.knowledge import validate_topic,bank_candidates,make_topic_practice,validate_topic_practice,GenerationError
from learning_service.server import Application,ThreadingHTTPServer,make_handler,normalize_problem
from learning_service.model import make_lesson,validate_lesson

def topic_lesson():
    pages=[dict(kind=k,title=k,narration='观察连接变化',content=['节点保存值和下一个节点的位置。']) for k in ['原理','语法','示例','动手实践','易错','总结']]
    lab=dict(title='连接两个节点',task='补写 next，输出后继节点的值。',starterCode='#include <iostream>\nstruct Node { int value; Node *next; };\nint main(){ Node a{1,nullptr}, b{2,nullptr}; /* TODO */ }',input='',expectedOutput='2',hint='使用取地址运算符。')
    pages[1].update(syntax=dict(code='Node *next = nullptr;',notes=['Node * 表示节点指针。']),lab=lab)
    pages[3]['lab']=copy.deepcopy(lab)
    return dict(title='链表原理与语法',summary='节点之间通过指针连接。',knowledgePoints=['链表'],pages=pages)

def generated():
    return {'problems':[dict(title=f'大数加法练习{i}',description='输入两个非负十进制整数，输出它们的和。',input='两个整数',output='它们的和',constraints='每个整数不超过100位',tags=['高精度'],sampleInput='9 1',sampleOutput='10',cases=[dict(input='9 1',expected='10',score=50),dict(input='0 0',expected='0',score=50)]) for i in range(3)]}

class KnowledgeTests(unittest.TestCase):
    def test_variants_follow_selected_problem_without_a_lesson(self):
        with tempfile.TemporaryDirectory() as tmp:
            app=Application({'key':'fixture','model':'fixture'},tmp)
            try:
                problem=normalize_problem(dict(id='selected',title='所选题目',description='计算两个大数之和',level=5,tags=['高精度']))
                ident='f'*32
                app.jobs[ident]=dict(id=ident,kind='practice',status='queued')
                with patch('learning_service.server.completion',return_value=generated()) as model:
                    app.work(ident,'practice',dict(problem=problem))
                self.assertEqual(app.jobs[ident]['status'],'completed')
                self.assertEqual(model.call_args.args[2]['problem']['id'],'selected')
                self.assertEqual(model.call_args.args[2]['knowledgePoints'],['高精度'])
                self.assertEqual(model.call_args.args[2]['targetLevel'],5)
                self.assertTrue(model.call_args.kwargs['enable_thinking'])
                result=app.read('practice',ident)
                self.assertEqual(result['sourceProblemId'],'selected')
                self.assertEqual(len(result['problems']),3)
            finally:app.pool.shutdown(wait=True)

    def test_single_topic_and_level_validation_and_bank_priority(self):
        for body in [dict(topic='',targetLevel=5),dict(topic='二分与贪心',targetLevel=5),dict(topic='贪心',targetLevel=True),dict(topic='贪心',targetLevel=9)]:
            with self.assertRaises(GenerationError):validate_topic(body)
        self.assertEqual(validate_topic(dict(topic='高精度',targetLevel=5)),('高精度',5))
        bank=[dict(id='single',level=5,tags=['贪心','循环']),dict(id='mixed',level=5,tags=['贪心','排序']),dict(id='high',level=6,tags=['贪心']),dict(id='ungraded',level=None,collection='xiaohou-bank',tags=['贪心'])]
        self.assertEqual([p['id'] for p in bank_candidates(bank,'贪心',5)],['single'])

    def test_generated_practice_is_bounded_and_focused(self):
        with patch('learning_service.knowledge.completion',return_value=generated()) as model:
            problems=make_topic_practice({},'高精度',5,normalize_problem,lambda _:None)
        self.assertTrue(all(p['knowledgeTopic']=='高精度' and p['level']==5 for p in problems))
        self.assertEqual(model.call_args.args[2]['topic'],'高精度')
        self.assertEqual(model.call_args.args[2]['targetLevel'],5)
        self.assertIn('高精度',model.call_args.args[2]['allowedTags'])
        self.assertEqual(model.call_count,1)
        self.assertTrue(model.call_args.kwargs['enable_thinking'])
        self.assertEqual(model.call_args.kwargs['thinking_budget'],8192)
        # The example sent to the model must satisfy the same case count/score
        # contract as the validator, rather than showing one 100-point case.
        shape=json.loads(model.call_args.args[1].split('题目对象结构：')[1])
        self.assertEqual(len(shape['cases']),2)
        self.assertEqual(sum(c['score'] for c in shape['cases']),100)
        self.assertIn('单知识点',model.call_args.kwargs['system'])
        for field,value in [('tags',['高精度','动态规划']),('sampleOutput','wrong'),('constraints',''),('cases',[dict(input='9 1',expected='10',score=100)])]:
            bad=generated();bad['problems'][0][field]=value
            with patch('learning_service.knowledge.completion',return_value=bad) as model:
                with self.assertRaises(GenerationError):make_topic_practice({},'高精度',5,normalize_problem,lambda _:None)
                self.assertEqual(model.call_count,2)

    def test_practice_repair_preserves_topic_and_returns_only_complete_set(self):
        for field,value in [('constraints',''),('cases',[dict(input='9 1',expected='10',score=100)])]:
            bad=generated();bad['problems'][1][field]=value
            with patch('learning_service.knowledge.completion',side_effect=[bad,generated()]) as model:
                result=make_topic_practice({},'高精度',5,normalize_problem,lambda _:None)
            self.assertEqual(len(result),3)
            first,second=model.call_args_list
            self.assertEqual(first.args[2]['topic'],second.args[2]['topic'])
            self.assertEqual(first.args[2]['targetLevel'],second.args[2]['targetLevel'])
            self.assertEqual(second.args[2]['previousResult'],bad)
            self.assertIn('第 2 道',second.args[2]['validationError'])
            self.assertEqual(second.kwargs['attempts'],1)
            for call in (first,second):
                self.assertTrue(call.kwargs['enable_thinking'])
                self.assertEqual(call.kwargs['thinking_budget'],8192)

    def test_lesson_variants_use_thinking_and_persist_complete_practice(self):
        with tempfile.TemporaryDirectory() as tmp:
            app=Application({'model':'fixture'},tmp)
            lesson_id='a'*32;job_id='b'*32
            lesson=dict(id=lesson_id,problem=dict(title='大数加法',description='求两个非负整数的和。'),targetLevel=5,knowledgePoints=['高精度'])
            app.save('lessons',lesson_id,lesson)
            app.jobs[job_id]=dict(id=job_id,kind='practice',status='queued')
            try:
                with patch('learning_service.server.completion',return_value=generated()) as model:
                    app.work(job_id,'practice',{'lessonId':lesson_id})
                self.assertEqual(app.jobs[job_id]['status'],'completed')
                self.assertEqual(len(app.read('practice',job_id)['problems']),3)
                self.assertTrue(model.call_args.kwargs['enable_thinking'])
                self.assertEqual(model.call_args.kwargs['thinking_budget'],8192)
                self.assertEqual(model.call_args.args[2]['problem'],lesson['problem'])
                shape=json.loads(model.call_args.args[1].split('题目对象结构：')[1])
                self.assertEqual(len(shape['cases']),2)
                self.assertEqual(sum(c['score'] for c in shape['cases']),100)
            finally:app.pool.shutdown(wait=True)

    def test_practice_validation_reports_specific_fields_and_rejects_fake_cases(self):
        for field in ['input','output','constraints','sampleInput','sampleOutput']:
            bad=generated();bad['problems'][0][field]=' '
            with self.assertRaises(GenerationError) as caught:validate_topic_practice(bad,'高精度',5,normalize_problem)
            self.assertIn(field,str(caught.exception))
        for cases,hint in [
            ([dict(input='9 1',expected='10',score=33),dict(input='0 0',expected='0',score=33),dict(input='1 1',expected='2',score=33)],'99'),
            ([dict(input='9 1',expected='10',score=50)]*2,'重复'),
            ([dict(input='9 1',expected='10',score=50),dict(input='0 0',expected='',score=50)],'expected'),
        ]:
            bad=generated();bad['problems'][0]['cases']=cases
            with self.assertRaises(GenerationError) as caught:validate_topic_practice(bad,'高精度',5,normalize_problem)
            self.assertIn(hint,str(caught.exception))

    def test_topic_has_separate_structure_and_level_scope(self):
        with patch('learning_service.topic_lesson.completion',return_value=topic_lesson()) as model:
            result=make_lesson({},dict(kind='knowledge-topic',tags=['链表']),5,{'level':5},'',lambda _:None)
        request=model.call_args.args[2];scope=request['abilityScope']
        self.assertEqual(request['targetLevel'],5);self.assertEqual(scope['currentLevel']['level'],5)
        self.assertEqual([l['level'] for l in scope['prerequisiteLevels']],[1,2,3,4])
        self.assertEqual([l['level'] for l in scope['higherLevelsExcluded']],[6,7,8])
        self.assertEqual(scope['standard'],'C++11-compatible');self.assertEqual(result['topicSchema'],2)
        self.assertIn('lab',model.call_args.args[1]);self.assertIn('不是讲一道算法题',model.call_args.kwargs['system'])
        self.assertEqual(result['pages'][1]['lab']['input'],'')

    def test_topic_rejects_problem_template_or_incomplete_experiments(self):
        for mutate in [lambda p:p.update(kind='题目'),lambda p:p.pop('lab'),lambda p:p.pop('syntax'),lambda p:p['lab'].update(expectedOutput=''),lambda p:p['lab'].update(starterCode='Node *next;')]:
            bad=topic_lesson();mutate(bad['pages'][1])
            with self.assertRaises(GenerationError):validate_lesson(bad,knowledge=True)

    def test_optional_table_cannot_block_valid_topic_or_lose_lab(self):
        for trace in [None,{},[],{'headers':['状态'],'rows':[]},{'headers':['状态'],'rows':[['a','b']]},{'headers':['状态'],'rows':'无'}]:
            lesson=topic_lesson();lesson['pages'][1]['trace']=trace;lesson['pages'][1]['code']=None
            validate_lesson(lesson,knowledge=True)
            self.assertIsInstance(lesson['pages'][1]['trace'],dict)
            self.assertEqual(lesson['pages'][1]['lab']['expectedOutput'],'2')
            self.assertEqual(lesson['pages'][1]['code'],'')

    def test_http_bank_before_llm_and_persistence(self):
        cfg={'key':'fixture','base':'http://127.0.0.1:1','model':'fixture','visionModel':'fixture','source':'test'}
        opener=build_opener(ProxyHandler({}))
        with tempfile.TemporaryDirectory() as tmp:
            app=Application(cfg,tmp);server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(app));threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}'
            # Keep the bank/LLM boundary deterministic as the real catalog grows.
            app.bank=[dict(id='enumeration-fixture',level=3,tags=['枚举'])]
            def post(body,path='/api/knowledge-practice'):
                try:
                    with opener.open(Request(url+path,json.dumps(body).encode(),{'Content-Type':'application/json'})) as r:return r.status,json.loads(r.read())
                except HTTPError as e:return e.code,json.loads(e.read())
            try:
                problem=dict(kind='knowledge-topic',title='链表',description='学习原理',level=5,tags=['链表'])
                for p,level in [(problem,6),({**problem,'tags':['链表','递归']},5),({**problem,'tags':['链表与递归']},5)]:
                    self.assertEqual(post(dict(problem=p,targetLevel=level),'/api/lessons')[0],400)
                with patch('learning_service.knowledge.completion',return_value=generated()) as model:
                    status,error=post(dict(topic='枚举',targetLevel=3));self.assertEqual(status,400);self.assertEqual(error['error']['code'],'bank_available');model.assert_not_called()
                    status,job=post(dict(topic='高精度',targetLevel=5));self.assertEqual(status,202)
                    for _ in range(200):
                        if app.jobs[job['id']]['status'] in ('completed','failed'):break
                        time.sleep(.01)
                    self.assertEqual(app.jobs[job['id']]['status'],'completed');model.assert_called_once()
                    with opener.open(url+'/api/practice') as r:records=json.loads(r.read())
                    self.assertEqual(records[0]['topic'],'高精度');self.assertEqual(len(records[0]['problems']),3);self.assertEqual(records[0]['problems'][0]['knowledgeTopic'],'高精度')
                    self.assertEqual(app.read('practice',job['id'])['targetLevel'],5)
            finally:server.shutdown();server.server_close();app.pool.shutdown(wait=True)
