import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'scripts'))
sys.path.insert(0,str(ROOT))
from import_xiaohou_bank import samples_from, statement_fields, convert, fingerprint, SEED_ID, clean_placeholder
from xiaohou_bank_classification import classify
from learning_service.server import normalize_problem


class BankImportTests(unittest.TestCase):
    def test_platform_null_prose_is_removed_without_changing_real_null_content(self):
        data=dict(descMD='null\n![](https://example.com/a.png)\n\n正文包含 null。\n```\nnull\n```\n$T \\neq null$',
                  inputFormatMd='null',inputFormat='<p>一个整数</p>',outputFormatMd=None,
                  outputFormat='<p>null</p>',tipsMd='null',tips='<p>null</p>',
                  sample=[dict(inputSample='null\n',outputSample='null')])
        fields=statement_fields(data)
        self.assertTrue(fields['description'].startswith('![]('))
        self.assertIn('正文包含 null。',fields['description'])
        self.assertIn('```\nnull\n```',fields['description'])
        self.assertIn('$T \\neq null$',fields['description'])
        self.assertEqual(fields['input'],'一个整数')
        self.assertEqual(fields['output'],'')
        self.assertEqual(fields['tips'],'')
        self.assertEqual(samples_from(data),[dict(input='null\n',output='null')])
        self.assertEqual(clean_placeholder('  null\r\nnull\r\n题目'), '题目')
        for value in ('null 是空指针','nullable','```\nnull\n```','输出 null'):
            self.assertEqual(clean_placeholder(value),value)

    def test_separate_legacy_sample_sections_preserve_sample_explanation_images(self):
        data=dict(descMD='【题目描述】\n题干\n【输入格式】\n两个整数\n【输出格式】\n和\n【输入样例#1】\n\n    1 2\n\n【输出样例#1】\n\n    3\n\n【输入输出样例1说明】\n![](https://example.com/a.png)\n求和\n【数据规模与约定】\n不超过100')
        self.assertEqual(samples_from(data),[dict(input='1 2',output='3')])
        fields=statement_fields(data)
        self.assertEqual(fields['output'],'和')
        self.assertIn('example.com/a.png',fields['tips'])
        self.assertEqual(fields['constraints'],'不超过100')

    def test_samples_embedded_in_statement_are_recovered_even_if_structured_samples_are_partial(self):
        data=dict(sample=[dict(inputSample='1\n',outputSample='2\n')],descMD='''【题目描述】
说明
【输入格式】
一个整数。
【输出格式】
输出答案。
【输入输出样例#1】
<xh-example><example-input>
    1
</example-input><example-output>
    2
</example-output></xh-example>
【输入输出样例#2】
<xh-example><example-input>
    3
    4 5
</example-input><example-output>
    9
</example-output></xh-example>
【数据范围】
1≤n≤100
''')
        samples=samples_from(data)
        self.assertEqual(samples,[dict(input='1\n',output='2\n'),dict(input='3\n4 5',output='9')])
        fields=statement_fields(data)
        self.assertEqual(fields['description'],'说明')
        self.assertEqual(fields['input'],'一个整数。')
        self.assertEqual(fields['output'],'输出答案。')
        self.assertIn('100',fields['constraints'])

    def test_broad_and_advanced_labels_never_get_forced_into_a_low_gesp_level(self):
        for topics,difficulty,status in [([], '普及-', '待归级'),(['数学','一维数组'],'普及-','待归级'),(['线段树'],'普及-','竞赛拓展'),(['一维数组'],'提高+/省选-','竞赛拓展')]:
            with self.subTest(topics=topics):
                result=classify(dict(labelList=topics,difficultyStr=difficulty),'题目','')
                self.assertIsNone(result['level']);self.assertEqual(result['levelStatus'],status)
        result=classify(dict(labelList=['最大公约数'],difficultyStr='普及-'),'题目','')
        self.assertEqual(result['level'],5)
        self.assertIn('未逐题复核',result['levelStatus'])

    def test_original_contest_group_is_preserved_when_difficulty_is_different(self):
        self.assertEqual(classify(dict(origin='21',labelList=['线段树'],difficultyStr='普及+/提高'),'题目','CSP-J')['group'],'csp-j')
        self.assertEqual(classify(dict(origin='22',labelList=['模拟'],difficultyStr='入门'),'题目','CSP-S')['group'],'csp-s')

    def test_deduplication_does_not_merge_same_title_with_different_samples(self):
        p=dict(title='求和',description='计算和',samples=[dict(input='1 2',output='3')])
        self.assertEqual(fingerprint(p),fingerprint({**p,'id':'different','source':{'url':'another'}}))
        self.assertNotEqual(fingerprint(p),fingerprint({**p,'samples':[dict(input='2 3',output='5')]}))
        self.assertNotEqual(fingerprint(p),fingerprint({**p,'samples':[dict(input='12',output='3')]}))

    def test_imported_records_survive_backend_validation_including_ungraded(self):
        catalog=json.loads((ROOT/'data/xiaohou-bank/index.json').read_text())
        for row in catalog['problems']:
            with self.subTest(id=row['id']):
                p=json.loads((ROOT/row['file']).read_text());result=normalize_problem(p)
                for key in ('id','collection','group','level','knowledgePoints','samples','cases','tips'):
                    self.assertEqual(result[key],p[key])


if __name__=='__main__':
    unittest.main()
