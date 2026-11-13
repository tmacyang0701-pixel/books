import copy
import tempfile
import threading
import unittest
from unittest.mock import patch
import test_learning as fixtures
from test_knowledge import topic_lesson
from learning_service.cpp_code import check_identifiers, repair_lesson_identifiers, regenerate_code, compile_cpp, compiler_path
from learning_service.model import GenerationError, validate_lesson
from learning_service.server import Application, ThreadingHTTPServer, make_handler


CODE = '#include <iostream>\nint main(){ int limit=10; /* 偶数上限 */ std::cout << limit; }'


class CppCodeTests(unittest.TestCase):
    def test_chinese_comments_strings_and_raw_strings_are_allowed(self):
        check_identifiers(CODE+'\n// 中文说明\nconst char* s="输出\\\"说明"; auto raw=R"tag(多行\n中文说明)tag";')
        check_identifiers("int total=1'000; char c='a'; // 千位分隔符")
        check_identifiers('int total; // 中文说明\\\n注释续行\n')

    def test_identifiers_ucn_and_digit_separators_cannot_hide_chinese(self):
        for code in ['int 偶数上限;',r'int \u4e2d;',r'int \U00004e2d;',"int a=1'000; int 中文; int b=2'000;",'int main(){ return ０; }']:
            with self.subTest(code=code), self.assertRaises(GenerationError) as caught:check_identifiers(code)
            self.assertEqual(caught.exception.code,'cpp_identifiers')

    def test_all_executable_fields_are_validated_but_pseudocode_stays_chinese(self):
        lesson=topic_lesson();lesson['pages'][0]['pseudocode']='如果 数字 是偶数，输出 数字'
        validate_lesson(copy.deepcopy(lesson),knowledge=True)
        for field in ['code','syntax','lab']:
            bad=copy.deepcopy(lesson)
            if field=='code':bad['pages'][0]['code']='int 数字=0;'
            elif field=='syntax':bad['pages'][1]['syntax']['code']='int 数字=0;'
            else:bad['pages'][1]['lab']['starterCode']='int main(){int 数字=0;}'
            with self.subTest(field=field), self.assertRaises(GenerationError) as caught:validate_lesson(bad,knowledge=True)
            self.assertEqual(caught.exception.code,'cpp_identifiers')

    def test_lesson_identifier_repair_is_atomic_and_uses_thinking(self):
        original={'pages':[{'code':'int 上限=10;','syntax':{'code':'int 计数=0;'},'pseudocode':'计数增加一'}]}
        fixed={'repairs':[{'pageIndex':0,'field':'code','code':'int limit=10;'}, {'pageIndex':0,'field':'syntax.code','code':'int count=0;'}]}
        lesson=copy.deepcopy(original)
        with patch('learning_service.cpp_code.completion',return_value=fixed) as model:repair_lesson_identifiers({},lesson,lambda _:None)
        self.assertEqual(lesson['pages'][0]['code'],'int limit=10;')
        self.assertEqual(lesson['pages'][0]['pseudocode'],'计数增加一')
        self.assertTrue(model.call_args.kwargs['enable_thinking'])
        broken=copy.deepcopy(fixed);broken['repairs'][1]['code']='int 计数=0;'
        lesson=copy.deepcopy(original)
        with patch('learning_service.cpp_code.completion',return_value=broken),self.assertRaises(GenerationError):repair_lesson_identifiers({},lesson,lambda _:None)
        self.assertEqual(lesson,original)

    def test_regeneration_repairs_compile_failure_and_keeps_lesson_unchanged(self):
        lesson={'problem':{'title':'原题'},'targetLevel':5,'pages':[{'code':'int main(){int 中文;}','narration':'原讲稿'}]}
        snapshot=copy.deepcopy(lesson)
        with patch('learning_service.cpp_code.completion',side_effect=[{'code':'int main(){ invalid; }'},{'code':CODE}]) as model,patch('learning_service.cpp_code.compile_cpp',side_effect=[GenerationError('cpp_compile','undefined invalid'),{'compiled':True,'message':'compiled'}]):
            result=regenerate_code({},lesson,0,lambda _:None)
        self.assertEqual(result['code'],CODE);self.assertEqual(lesson,snapshot)
        self.assertEqual(model.call_count,2)
        self.assertIn('undefined invalid',model.call_args.args[2]['validationError'])
        self.assertTrue(model.call_args.kwargs['enable_thinking'])

    def test_missing_compiler_is_explicit_not_a_claim_of_successful_compilation(self):
        with patch('learning_service.cpp_code.compiler_path',return_value=None):result=compile_cpp(CODE)
        self.assertFalse(result['compiled'])

    def test_actual_local_compiler_accepts_english_names_and_chinese_comments(self):
        if not compiler_path():self.skipTest('No local C++ compiler')
        self.assertTrue(compile_cpp(CODE)['compiled'])
        with self.assertRaises(GenerationError):compile_cpp('int main(){ undefined_name; }')


class CodeRegenerationApiTests(unittest.TestCase):
    request=fixtures.LearningTests.request
    wait=fixtures.LearningTests.wait

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.app=Application(fixtures.CFG,self.temp.name)
        self.lesson={'id':'a'*32,'title':'原课件','problem':{'id':'original','title':'原题'},'targetLevel':5,'pages':[{'code':'int main(){int 上限=10;}','narration':'原讲稿'}, {'code':'','title':'下一页'}]}
        self.app.save('lessons',self.lesson['id'],self.lesson)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.app))
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.url=f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.app.pool.shutdown(wait=True);self.temp.cleanup()

    def generate(self):
        status,job=self.request('/api/lesson-code',{'lessonId':self.lesson['id'],'pageIndex':0})
        self.assertEqual(status,202,job)
        return self.wait(job)

    def test_replaces_only_selected_code_and_preserves_other_concurrent_updates(self):
        def result(*args):
            latest=self.app.read('lessons',self.lesson['id']);latest['pages'][1]['title']='并发更新'
            self.app.save('lessons',self.lesson['id'],latest)
            return {'code':CODE,'validation':{'compiled':True}}
        with patch('learning_service.server.regenerate_code',side_effect=result):done=self.generate()
        self.assertEqual(done['status'],'completed',done)
        updated=self.app.read('lessons',self.lesson['id'])
        self.assertEqual(updated['pages'][0]['code'],CODE)
        self.assertEqual(updated['pages'][0]['narration'],'原讲稿')
        self.assertEqual(updated['pages'][1]['title'],'并发更新')
        self.assertEqual(updated['problem'],self.lesson['problem'])

    def test_failed_generation_preserves_original(self):
        with patch('learning_service.server.regenerate_code',side_effect=GenerationError('cpp_compile','bad code')):done=self.generate()
        self.assertEqual(done['status'],'failed')
        self.assertEqual(self.app.read('lessons',self.lesson['id']),self.lesson)

    def test_stale_result_cannot_overwrite_newer_code(self):
        def result(*args):
            latest=self.app.read('lessons',self.lesson['id']);latest['pages'][0]['code']='int main(){return 7;}'
            self.app.save('lessons',self.lesson['id'],latest)
            return {'code':CODE,'validation':{'compiled':True}}
        with patch('learning_service.server.regenerate_code',side_effect=result):done=self.generate()
        self.assertEqual(done['error']['code'],'stale_code')
        self.assertEqual(self.app.read('lessons',self.lesson['id'])['pages'][0]['code'],'int main(){return 7;}')

    def test_invalid_pages_and_duplicate_generation_rejected(self):
        for index in [-1,True,1,2,'0']:
            self.assertEqual(self.request('/api/lesson-code',{'lessonId':self.lesson['id'],'pageIndex':index})[0],400)
        with patch.object(self.app.pool,'submit'):
            payload={'lessonId':self.lesson['id'],'pageIndex':0}
            self.app.enqueue('lesson-code',payload)
            with self.assertRaises(GenerationError) as caught:self.app.enqueue('lesson-code',payload)
            self.assertEqual(caught.exception.code,'busy')


if __name__=='__main__':unittest.main()
