"""Regression checks for the unchanged native judge used by the new results drawer."""
import importlib.util
import json
import os
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]


class NativeJudgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source=ROOT/'native-host/judge.py'
        candidates=[Path('D:/Dev-Cpp/TDM-GCC-64/bin/g++.exe'),Path('C:/Program Files (x86)/Embarcadero/Dev-Cpp/TDM-GCC-64/bin/g++.exe')]
        compiler=next((p for p in candidates if p.is_file()),None)
        if not source.is_file() or not compiler:raise unittest.SkipTest('Existing native judge or GCC unavailable')
        cls.previous=os.environ.get('CXX');os.environ['CXX']=str(compiler)
        spec=importlib.util.spec_from_file_location('codearena_existing_judge',source)
        cls.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.module)

    @classmethod
    def tearDownClass(cls):
        if cls.previous is None:os.environ.pop('CXX',None)
        else:os.environ['CXX']=cls.previous

    def test_accepted_and_wrong_answer_include_output_diff(self):
        p=json.loads((ROOT/'problem.json').read_text(encoding='utf-8'))
        code='#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b;}'
        good=self.module.judge({'mode':'judge','code':code,'cases':p['cases']})
        self.assertEqual(good['score'],100);self.assertTrue(all(r['status']=='AC' for r in good['results']))
        bad=self.module.judge({'mode':'judge','code':code.replace('a+b','a-b'),'cases':p['cases']})
        self.assertEqual(bad['results'][0]['status'],'WA');self.assertEqual(bad['results'][0]['actual'],'-1')
        self.assertEqual(bad['results'][0]['expected'],'3\n')

    def test_runtime_stderr_is_not_a_connection_failure(self):
        result=self.module.judge({'mode':'run','code':'#include <iostream>\nint main(){std::cout<<30;std::cerr<<"diagnostic";}','input':''})
        self.assertEqual(result['status'],'OK');self.assertEqual(result['output'],'30');self.assertEqual(result['error'],'diagnostic')

    def test_cpp_solution_against_curated_factorization_cases(self):
        code='''#include <iostream>
using namespace std;
int main(){long long n;cin>>n;bool first=true;for(long long p=2;p*p<=n;++p){int e=0;while(n%p==0){n/=p;++e;}if(e){if(!first)cout<<" * ";first=false;cout<<p;if(e>1)cout<<"^"<<e;}}if(n>1){if(!first)cout<<" * ";cout<<n;}cout<<"\\n";}'''
        p=json.loads((ROOT/'data/gesp/level-5/gesp-2023-09-5-1.json').read_text(encoding='utf-8'))
        result=self.module.judge({'mode':'judge','code':code,'cases':p['cases']})
        self.assertEqual(result['score'],100,result)


if __name__=='__main__':unittest.main()
