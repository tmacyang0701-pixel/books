"""Rebuild the three 2026-11-14 supplemental problems without account credentials.

Statements are paraphrased from the user-authorized course; samples are preserved.
All additional judge data is locally authored, not the platform's hidden data.
Run --verify to cross-check the oracles and execute C++17 through the local judge.
"""
import argparse
import itertools
import json
import random
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION = '2026-11-14 小猴综合训练 I'
PREFIX = 'xiaohou-2026-11-14-5-'
ARCHIVE = ROOT / 'data/gesp/extra-tests/xiaohou-2026-11-14.zip'
SOURCE = ('https://www.xiaohoucode.com/login/#/studentcompiler?bundleTag=3'
          '&bundleId=41408a03ed9af86c46941a05dd97f2a0'
          '&classId=76cd83fcab05456183630487ecfea219'
          '&lessonId=4408b376d45238efe5051a05dd97ed90')


def lottery(text):
    n, a, b = text.split()
    assert len(a) == len(b) == int(n) and a.isdigit() and b.isdigit()
    def wins(s):
        return any(s[i] == s[i-1] or (i >= 2 and s[i] == s[i-2]) for i in range(1, len(s)))
    return ('All' if wins(b) else 'Ming') if wins(a) else ('Hong' if wins(b) else 'No')


def words(text):
    word, article = text.splitlines()[:2]
    matches = [m.start() for m in re.finditer(r'[a-z]+', article.lower()) if m.group() == word.lower()]
    return f'{len(matches)} {matches[0]}' if matches else '-1'


def reverse_min(s):
    s = s.strip()
    left = s.find('1')
    if left < 0:
        return s
    # Any improving reversal starts at the first 1 and ends at a later 0.
    return min([s] + [s[:left] + s[left:right+1][::-1] + s[right+1:]
                      for right in range(left+1, len(s)) if s[right] == '0'])


SOLVERS = [lottery, words, reverse_min]


def make_cases():
    rng = random.Random(20261114)
    def ticket(a, b):
        assert len(a) == len(b)
        return f'{len(a)}\n{a}\n{b}\n'
    a = [
        (ticket('172275', '654321'), '原题样例：只有小明中奖'),
        (ticket('1', '9'), '长度为 1，均不中奖'),
        (ticket('11', '22'), '长度为 2，双方中奖'),
        (ticket('12', '33'), '只有小红中奖'),
        (ticket('12', '34'), '长度为 2，均不中奖'),
        (ticket('121', '123'), '只有长度为 3 的奇数回文'),
        (ticket('123', '121'), '奇数回文出现在小红号码'),
        (ticket('121', '343'), '两人均有奇数回文'),
        (ticket('112345', '123456'), '中奖片段在开头'),
        (ticket('123455', '123456'), '中奖片段在末尾'),
        (ticket('123452', '123456'), '重复数字不一定构成回文'),
        (ticket('120034', '120345'), '中间连续的零'),
        (ticket('123456', '123454'), '末尾的奇数回文'),
        (ticket('12344321', '12345678'), '整个号码为偶数回文'),
        (ticket('123456789', '123454321'), '整个号码为奇数回文'),
        (ticket('0', '0'), '单个零不构成中奖片段'),
        (ticket('012', '010'), '保留前导零的字符串读取'),
        (ticket('1234567890'*900, '2345678901'*900), '长串无回文，扫描全部字符'),
        (ticket('1234567890'*899+'1234567899', '2345678901'*900), '长串仅末尾中奖'),
        (ticket('1'*9000, '2'*9000), '长串全部相同'),
    ]
    b = [
        ('To\nto be or not to be is a question\n', '原题样例 1：忽略大小写'),
        ('to\nDid the Ottoman Empire lose its power at that time\n', '原题样例 2：子串不算单词'),
        ('a\nA\n', '最短输入，首位置为零'),
        ('a\nb\n', '不存在目标单词'),
        ('cat\ncat cat cat\n', '连续匹配，不能跳过相邻单词'),
        ('cat\nCat cAT CAT\n', '多种大小写'),
        ('cat\n  cat   dog cat  \n', '前后空格及多个分隔空格'),
        ('cat\ncatdog dogcat cats scat\n', '排除前缀、后缀及内部匹配'),
        ('cat\ncatdog cat dogcat cat\n', '部分匹配与完整匹配混合'),
        ('end\nstart middle END\n', '只在文章结尾命中'),
        ('hi\nHi there\n', '只在文章开头命中'),
        ('abcdefghij\nxx ABCDEFGHIJ abcdefghijk abcdefghij\n', '目标词达到长度上限 10'),
        ('a\naa a aaa A aA a\n', '单字母完整匹配'),
        ('word\n \n', '文章只有一个空格'),
        ('word\n     \n', '文章全为空格'),
        ('to\nTO  To   tO    to\n', '可变空格不影响计数，位置按原文'),
        ('x\n'+'a '*9499+'X\n', '长文章只在末尾命中'),
        ('a\n'+'a '*9499+'A\n', '大量相邻匹配'),
        ('abc\n'+'x'*19000+'\n', '长单词包含零个匹配'),
        ('Target\n'+' '*18000+'TaRgEt\n', '大量前导空格，不能 trim 文章'),
    ]
    binary = [
        ('101', '原题样例 1'), ('0010100', '原题样例 2'),
        ('0', '单字符 0'), ('1', '单字符 1'), ('000000', '全部为零'),
        ('111111', '全部为一'), ('000111', '已经最小，只翻转一个字符'),
        ('111000', '翻转整个字符串'), ('10', '最短有效翻转'),
        ('01', '两字符无需改变'), ('10010', '最优右端点不一定是最后一个零'),
        ('10100', '最长零段对应的右端点'), ('0011001010', '保留前导零'),
        ('101010101', '交替排列'), ('100100100', '多个等长零段'),
        ('000011110', '唯一末尾零'), ('1'*1500+'0'*1500, '长度上限 3000，整段逆序'),
        ('01'*1500, '长度上限 3000，交替排列'),
        (''.join(rng.choice('01') for _ in range(3000)), '固定随机种子的上限数据'),
        ('0'*2999+'1', '长度上限 3000，已经最小'),
    ]
    c = [(s+'\n', label) for s, label in binary]
    no = '1234567890'*100000
    stress = [
        [(ticket(no, no), 'n=1000000，无回文'),
         (ticket(no[:-1]+'9', no), 'n=1000000，仅小明最后两位相同'),
         (ticket('1'*1000000, '2'*1000000), 'n=1000000，双方全相同')],
        [('a\n'+'a '*500000+'\n', '文章长度 1000000，匹配 500000 次'),
         ('target\n'+' '*999994+'TARGET\n', '文章长度 1000000，末尾匹配'),
         ('abc\n'+'x'*1000000+'\n', '文章长度 1000000，无匹配')],
        [],  # The inline data already reaches the 3000-character constraint.
    ]
    return [a, b, c], stress


def problems():
    data, stress = make_cases()
    definitions = [
        dict(title='中彩票', tags=['字符串', '回文', '枚举'],
             description='小明和小红各有一个长度为 n 的彩票号码。如果号码中存在长度至少为 2 的连续回文片段，该彩票就中奖。回文片段从左向右和从右向左读完全相同，例如 22、121、654456。请判断两人的中奖情况。',
             input='输入三行：第一行是号码长度 n；第二行是小明的号码；第三行是小红的号码。两个号码均按字符串读取。',
             output='两人都中奖输出 All；只有小明中奖输出 Ming；只有小红中奖输出 Hong；两人都未中奖输出 No。',
             constraints='原题：60% 的数据 n ≤ 10000，满足特殊性质 1；100% 的数据 n ≤ 1000000。原平台第 7～8 点满足特殊性质 2，第 9～10 点无特殊性质。特殊性质 1：号码自身为回文，或不含长度至少为 2 的回文片段。特殊性质 2：若有回文片段，其位于号码正中间。这些分组指原平台数据，不对应本地自编测试点。',
             samples=[dict(input='6\n172275\n654321', output='Ming', explanation='172275 中包含回文片段 7227，654321 中不存在长度至少为 2 的回文片段，因此只有小明中奖。')],
             platformProjectId=144837, timeLimitSeconds=1, memoryLimitMB=256),
        dict(title='统计单词数', tags=['字符串', '枚举', '大小写转换'],
             description='给定目标单词和一行文章，统计该单词出现的次数，并找出第一次出现时首字母的位置。匹配不区分英文字母大小写，但必须匹配一个完整的独立单词；只匹配到其他单词的一部分不计数。文章中的空格也占字符位置。',
             input='输入两行：第一行是只包含英文字母的目标单词；第二行是只包含英文字母和空格的文章。保留文章中的前导、末尾和连续空格。',
             output='若找到目标单词，输出出现次数和首次出现的位置，中间用一个空格分隔；字符位置从 0 开始。若未找到，输出 -1。',
             constraints='目标单词长度为 1～10；文章长度为 1～1000000。',
             samples=[dict(input='To\nto be or not to be is a question', output='2 0', explanation='忽略大小写后，to 出现两次，第一次从位置 0 开始。'),
                      dict(input='to\nDid the Ottoman Empire lose its power at that time', output='-1', explanation='Ottoman 内部包含字母片段 to，但它不是独立单词，因此不计入。')],
             platformProjectId=126688, timeLimitSeconds=1, memoryLimitMB=128),
        dict(title='[入门赛 #14] 扶苏和串 (Hard Version)', tags=['字符串', '枚举', '贪心', '字典序'],
             description='给定只含 0 和 1 的字符串 s，选择一个非空连续子串，将该子串的字符顺序反转一次。子串以外的字符保持原位。求能得到的字典序最小的字符串。可以选择长度为 1 的子串，此时字符串不变。注意：反转指颠倒字符顺序，不是将 0、1 互换。',
             input='输入一行一个 01 字符串 s。', output='输出进行一次子串反转后，能够得到的字典序最小的字符串。',
             constraints='1 ≤ |s| ≤ 3000；s 只包含字符 0 和 1。',
             samples=[dict(input='101', output='011', explanation='反转第 1～2 个字符组成的子串 10，得到 011。'),
                      dict(input='0010100', output='0000101', explanation='反转第 3～7 个字符组成的子串 10100，前两个字符保持不变。')],
             platformProjectId=138853, referenceUrl='https://www.luogu.com.cn/problem/P9458',
             timeLimitSeconds=1, memoryLimitMB=524.288),
    ]
    result = []
    for i, p in enumerate(definitions):
        p['tags'].append('来源：学而思')
        reference = p.pop('referenceUrl', SOURCE)
        p.update(id=PREFIX+str(i+1), level=5, session=SESSION, number=i+1, kind='supplemental',
                 sampleInput=p['samples'][0]['input'], sampleOutput=p['samples'][0]['output'],
                 sampleLabel='原题样例',
                 cases=[dict(input=text, expected=SOLVERS[i](text)+'\n', score=5, label=label)
                        for text, label in data[i]],
                 casesSource='原题样例 + 自编练习测试点，每题 20 点、每点 5 分；非原平台隐藏评测数据。',
                 extraTests='data/gesp/extra-tests/xiaohou-2026-11-14.zip',
                 source=dict(organization='小猴编程', url=SOURCE, referenceUrl=reference,
                             checkedOn='2026-11-18', edition='题意整理版 · 五级补充练习',
                             note='来自 2026-11-14《真题综合训练 I》课课练，按用户要求归入五级补充练习，不标为 GESP 五级官方真题。原题样例完整保留。平台接口未返回测试点内容，本地评测点为自编。前两题的百万字符数据另附测试包，超过现有页面每点 20KB 的限制；第三题页面测试已覆盖长度上限。时间及内存为原平台标注，本地评测沿用现有执行限制。'))
        result.append(p)
    return result, stress


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2)+'\n'
    # Existing bank metadata uses CRLF; avoid rewriting every unchanged line.
    if path.name in ('index.json', 'coverage.json'):
        text = text.replace('\n', '\r\n')
    path.write_bytes(text.encode('utf-8'))


def write_bank(ps, stress, *, prefix=PREFIX, archive=ARCHIVE, solvers=SOLVERS):
    index_path = ROOT / 'data/gesp/index.json'
    index = json.loads(index_path.read_text(encoding='utf-8'))
    index['problems'] = [p for p in index['problems'] if not p['id'].startswith(prefix)]
    for p in ps:
        name = f'data/gesp/level-5/{p["id"]}.json'
        write_json(ROOT/name, p)
        index['problems'].append(dict({k:p[k] for k in ('id','level','session','number','kind','title','tags')}, file=name))
    index['updatedAt'] = '2026-11-18'
    supplemental = sum(p['kind']=='supplemental' for p in index['problems'])
    index['scope'] = f'C++ 1～8 级历年编程题整理版（216 道，截至 2026-09），另含五级补充练习 {supplemental} 道；不含选择题、判断题和官方隐藏评测数据。'
    write_json(index_path, index)
    coverage_path = ROOT / 'data/gesp/coverage.json'
    coverage = json.loads(coverage_path.read_text(encoding='utf-8'))
    coverage['updatedAt'] = '2026-11-18'
    coverage['total'] = len(index['problems'])
    coverage['pastPaperTotal'] = sum(p['kind']=='past-paper' for p in index['problems'])
    coverage['supplementalTotal'] = supplemental
    for level in coverage['levels']:
        entries = [p for p in index['problems'] if p['level']==level['level']]
        level['count'] = len(entries)
        level['sessions'] = sorted(set(p['session'] for p in entries))
    write_json(coverage_path, coverage)
    archive.parent.mkdir(parents=True, exist_ok=True)
    manifest = dict(source='自编数据，非平台隐藏评测点', problems=[])
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        def add(name, content):
            info = zipfile.ZipInfo(name, date_time=(2026,11,18,0,0,0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, content.encode('utf-8'))
        for i, p in enumerate(ps):
            cases = [(c['input'], c['expected'], c['label'], '页面评测') for c in p['cases']]
            cases += [(s, solvers[i](s)+'\n', label, '离线大数据') for s,label in stress[i]]
            entry = dict(id=p['id'], title=p['title'], cases=[])
            for n, (text, expected, label, scope) in enumerate(cases, 1):
                stem = f'{p["id"]}/{n:02}'
                add(stem+'.in', text); add(stem+'.out', expected)
                entry['cases'].append(dict(input=stem+'.in', output=stem+'.out', label=label, scope=scope))
            manifest['problems'].append(entry)
        add('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
        add('README.txt', '小猴五级补充练习测试包\n每题前 20 点与题库页面相同，每点 5 分。其余文件为超过页面输入或输出大小限制的离线大数据。具体规模、用途、文件名见 manifest.json。\n所有附加测试点均为自编，不是原平台隐藏数据。\nC++17 编译示例：g++ -std=c++17 -O2 main.cpp -o main\n运行示例（macOS/Linux）：./main < 01.in > actual.out\nWindows：main.exe < 01.in > actual.out\n将 actual.out 与对应 .out 文件对比；换行符差异可忽略。\n')


CPP = [r'''
#include <iostream>
#include <string>
using namespace std;
bool win(const string& s) {
    for (int center=0; center<(int)s.size(); ++center) {
        if (center+1<(int)s.size() && s[center]==s[center+1]) return true;
        if (center>0 && center+1<(int)s.size() && s[center-1]==s[center+1]) return true;
    }
    return false;
}
int main(){int n; string a,b; cin>>n>>a>>b; bool x=win(a),y=win(b);
cout<<(x?(y?"All":"Ming"):(y?"Hong":"No"))<<'\n';}
''', r'''
#include <iostream>
#include <string>
#include <cctype>
using namespace std;
int main(){string w,s; getline(cin,w); getline(cin,s);
for(char& c:w)c=tolower((unsigned char)c);
int count=0, first=-1;
for(int i=0;i<(int)s.size();) {
    if(s[i]==' '){++i;continue;}
    int start=i; string token;
    while(i<(int)s.size() && s[i]!=' ') token+=tolower((unsigned char)s[i++]);
    if(token==w){if(first<0)first=start; ++count;}
}
if(!count)cout<<-1;else cout<<count<<' '<<first; cout<<'\n';}
''', r'''
#include <iostream>
#include <string>
#include <algorithm>
using namespace std;
int main(){string s;cin>>s; string best=s;
size_t l=s.find('1');
if(l!=string::npos)for(size_t r=l+1;r<s.size();++r)if(s[r]=='0'){
    string t=s; reverse(t.begin()+l,t.begin()+r+1); best=min(best,t);
}
cout<<best<<'\n';}
''']


def verify(ps, stress, *, solvers=SOLVERS, cpp_sources=CPP, archive=ARCHIVE):
    # Exhaustive independent definitions check both simplifying observations.
    for n in range(1,9):
        for chars in itertools.product('01', repeat=n):
            s = ''.join(chars)
            brute = min(s[:l]+s[l:r+1][::-1]+s[r+1:] for l in range(n) for r in range(l,n))
            assert reverse_min(s) == brute, s
    for n in range(1,7):
        for chars in itertools.product('012', repeat=n):
            s = ''.join(chars)
            win = any(s[l:r] == s[l:r][::-1] for l in range(n) for r in range(l+2,n+1))
            assert lottery(f'{n}\n{s}\n{s}\n') == ('All' if win else 'No')
    sys.path.insert(0, str(ROOT/'native-host'))
    from judge import judge, compiler_path
    for i, p in enumerate(ps):
        saved = json.loads((ROOT/f'data/gesp/level-5/{p["id"]}.json').read_text(encoding='utf-8'))
        assert saved == p, 'Run the builder to refresh packaged data'
        assert sum(c['score'] for c in p['cases']) == 100
        assert len({c['input'] for c in p['cases']}) == len(p['cases'])
        for sample in p['samples']:
            assert solvers[i](sample['input']).strip() == sample['output'].strip()
        payload = dict(code=cpp_sources[i], mode='judge', cases=p['cases'])
        assert len(json.dumps(payload, ensure_ascii=False).encode()) < 200000
        if sys.platform == 'darwin':
            # macOS may spend >2s assessing a new executable on its first launch.
            # Warm the same source once, then use the unchanged timed native judge.
            with tempfile.TemporaryDirectory(prefix='xiaohou_warm_') as tmp:
                (Path(tmp)/'main.cpp').write_text(cpp_sources[i], encoding='utf-8')
                binary = Path(tmp)/'program'
                subprocess.run([compiler_path(),'-std=c++17','-O2','-o',str(binary),'main.cpp'],cwd=tmp,check=True,capture_output=True)
                warm = subprocess.run([str(binary)],input=p['sampleInput'].encode(),capture_output=True,check=True,timeout=15)
                assert warm.stdout.decode().strip() == p['sampleOutput'].strip()
        result = judge(payload)
        assert result['status']=='AC' and result['score']==100, result
        print(f'{p["title"]}: native judge 20/20, 100/100')
    # Verify the actual exported .in/.out files, including all six million-char cases.
    with tempfile.TemporaryDirectory(prefix='xiaohou_verify_') as tmp, zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read('manifest.json'))
        for i, entry in enumerate(manifest['problems']):
            cpp, binary = Path(tmp)/f'{i}.cpp', Path(tmp)/f'{i}.bin'
            cpp.write_text(cpp_sources[i], encoding='utf-8')
            subprocess.run([compiler_path(), '-std=c++17','-O2',str(cpp),'-o',str(binary)],check=True,capture_output=True)
            for case in entry['cases']:
                actual = subprocess.run([str(binary)],input=z.read(case['input']),capture_output=True,check=True,timeout=2).stdout.decode().strip()
                assert actual == z.read(case['output']).decode().strip(), case
            print(f'{entry["title"]}: archive {len(entry["cases"])}/{len(entry["cases"])} passed')
    print(f'Independent exhaustive checks passed; all {sum(len(p["samples"]) for p in ps)} original samples match.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='verify existing artifacts without rewriting')
    args = parser.parse_args()
    ps, stress = problems()
    if args.verify:
        verify(ps, stress)
    else:
        write_bank(ps, stress)
        print('Wrote 3 problems, 60 inline cases, and 66 archive cases.')
