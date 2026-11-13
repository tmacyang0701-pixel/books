import os
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'native-host'))
from debugger import Debugger, debugger_path

CODE='''#include <iostream>
#include <vector>
int total=7;
int add(int left,int right){
 int sum=left+right;
 return sum;
}
int main(){
 int n=0;
 std::cin>>n;
 std::vector<int> numbers={2,4,6};
 int values[100]={9,8};
 int answer=add(n,4);
 std::cout<<answer<<std::endl;
 return 0;
}
'''

class DebuggerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous=os.environ.get('CXX')
        compiler=next((p for p in [Path('D:/Dev-Cpp/TDM-GCC-64/bin/g++.exe'),Path('C:/Program Files (x86)/Embarcadero/Dev-Cpp/TDM-GCC-64/bin/g++.exe')] if p.exists()),None)
        if not compiler:raise unittest.SkipTest('GCC is unavailable')
        os.environ['CXX']=str(compiler)
        if not debugger_path():raise unittest.SkipTest('GDB is unavailable')
    @classmethod
    def tearDownClass(cls):
        if cls.previous is None:os.environ.pop('CXX',None)
        else:os.environ['CXX']=cls.previous
    def setUp(self):self.debug=Debugger();self.addCleanup(self.debug.close)
    def start(self,code=CODE):
        result=self.debug.handle(dict(mode='debug_start',code=code,input='10',breakpoints=[13] if code==CODE else []))
        self.assertEqual(result['status'],'paused',result);self.sid=result['sessionId'];return result
    def request(self,mode,**kwargs):return self.debug.handle(dict(mode=mode,sessionId=self.sid,**kwargs))
    def test_real_steps_parameters_containers_memory_and_output(self):
        self.start()
        result=self.request('debug_step',action='continue');self.assertEqual(result['frame']['line'],13)
        rows={v['name']:v for v in result['variables']}
        self.assertEqual(rows['n']['value'],'10');self.assertEqual(rows['total']['value'],'7')
        children=self.request('debug_children',variableId=rows['numbers']['id'])
        self.assertEqual([v['value'] for v in children['variables']],['2','4','6'])
        memory=self.request('debug_memory',variableId=rows['n']['id'])
        self.assertEqual(memory['size'],4);self.assertEqual(memory['bytes'],'0a 00 00 00')
        first=self.request('debug_children',variableId=rows['values']['id']);self.assertEqual(len(first['variables']),80);self.assertTrue(first['more'])
        last=self.request('debug_children',variableId=rows['values']['id'],offset=80);self.assertEqual(len(last['variables']),20);self.assertFalse(last['more'])
        result=self.request('debug_step',action='step')
        self.assertEqual(result['frame']['function'],'add');self.assertGreater(len(result['frames']),1)
        args={v['name']:v['value'] for v in result['variables'] if v['group']=='argument'}
        self.assertEqual(args,dict(left='10',right='4'))
        result=self.request('debug_step',action='next');self.assertEqual(next(v['value'] for v in result['variables'] if v['name']=='sum'),'14')
        self.request('debug_step',action='finish')
        result=self.request('debug_step',action='continue');self.assertEqual(result['status'],'exited');self.assertEqual(result['output'].strip(),'14');self.assertIsNone(self.debug.session.process)
    def test_compile_failure_and_disconnect_release_resources(self):
        self.assertEqual(self.debug.handle(dict(mode='debug_start',code='not valid c++'))['status'],'CE')
        self.start();process=self.debug.session.process;folder=Path(self.debug.session.temp.name)
        self.debug.close();self.assertIsNotNone(process.poll());self.assertFalse(folder.exists())
    def test_next_after_output_preserves_frames_without_lexical_symbols(self):
        self.start('#include <iostream>\nint main(){\n int n=0;\n std::cin>>n;\n int answer=n+1;\n std::cout<<answer<<std::endl;\n return 0;\n}\n')
        self.request('debug_breakpoints',lines=[6])
        result=self.request('debug_step',action='continue')
        self.assertEqual(result['frame']['line'],6)
        result=self.request('debug_step',action='next')
        self.assertIn(result['status'],['paused','exited'])
        if result['status']=='paused':result=self.request('debug_step',action='continue')
        self.assertEqual(result['status'],'exited')
        self.assertEqual(result['output'].strip(),'11')
    def test_infinite_program_is_stopped_after_timeout(self):
        self.start('int main(){\n volatile int i=0;\n while(true){i++;}\n}')
        process=self.debug.session.process
        with self.assertRaisesRegex(RuntimeError,'8'):self.request('debug_step',action='continue')
        self.assertIsNotNone(process.poll());self.assertIsNone(self.debug.session)
    def test_arbitrary_inspector_expressions_are_rejected(self):
        self.start()
        with self.assertRaises(ValueError):self.request('debug_memory',variableId='system("bad")')

