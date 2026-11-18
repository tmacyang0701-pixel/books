#!/usr/bin/env python3
"""Convert the downloaded C++ bank into portable JSON and project catalog files."""
import argparse
from collections import Counter
import copy
import csv
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import textwrap
import unicodedata

from export_xiaohou_bank import dump
from import_xiaohou_csp import plain
from xiaohou_bank_classification import classify

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT/'gesp-lab-extension'
SEED_ID = '183f02521a304e709aa096a1a9c20fa2'
SECTIONS = re.compile(r'^\s*(?:#{1,6}\s*)?【(题目描述|输入格式|输出格式|数据范围|数据规模与约定|样例[^】]*|输入样例[^】]*|输出样例[^】]*|输入输出样例[^】]*)】\s*$', re.M)


def clean_placeholder(value):
    """Remove the platform's leading standalone null prose placeholder only.

    Never use this on samples; inline null, code and math are meaningful content.
    """
    if value is None:
        return ''
    return re.sub(r'\A(?:null[ \t]*(?:\r?\n|$)\s*)+', '', value.strip())


def preferred_prose(data, md, html_field):
    return clean_placeholder(data.get(md)) or clean_placeholder(plain(data.get(html_field)))


def markdown(value):
    value = clean_placeholder(value)
    value = re.sub(r'<img\b[^>]*>', lambda m: plain(m[0]), value, flags=re.I)
    return re.sub(r'</?center\b[^>]*>', '', value, flags=re.I).strip()


def samples_from(data):
    result = []
    raw = data.get('sample') or []
    if isinstance(raw, str):
        raw = json.loads(raw)
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get('inputSample'), str) or not isinstance(item.get('outputSample'), str):
            raise ValueError('Invalid platform sample structure')
        result.append(dict(input=item['inputSample'], output=item['outputSample']))
    for block in re.findall(r'<xh-example>(.*?)</xh-example>', data.get('descMD',''), re.S):
        a = re.search(r'<example-input>(.*?)</example-input>', block, re.S)
        b = re.search(r'<example-output>(.*?)</example-output>', block, re.S)
        if a and b:
            sample = dict(input=textwrap.dedent(a[1].strip('\n')).strip('\n'),
                          output=textwrap.dedent(b[1].strip('\n')).strip('\n'))
            if not any(s['input'].strip()==sample['input'].strip() and s['output'].strip()==sample['output'].strip() for s in result):
                result.append(sample)
    # Some older statements use separate indented input/output sample sections.
    raw = data.get('descMD', '')
    headings = list(re.finditer(r'^\s*(?:#{1,6}\s*)?【([^】]+)】\s*$', raw, re.M))
    pairs = {}
    for i, heading in enumerate(headings):
        match = re.fullmatch(r'(输入样例|样例输入|输出样例|样例输出)\s*#?(\d*)', heading[1])
        if not match:
            continue
        content = raw[heading.end():headings[i+1].start() if i+1<len(headings) else len(raw)].strip('\n')
        fence = re.match(r'\s*```[^\n]*\n(.*?)\n```', content, re.S)
        if fence:
            value = fence[1]
        else:
            lines = []
            for line in content.splitlines():
                if line and not line.startswith(('    ', '\t')):
                    break
                lines.append(line)
            if not lines:
                continue
            value = textwrap.dedent('\n'.join(lines)).strip('\n')
        pairs.setdefault(match[2] or '1', {})['input' if '输入' in match[1] else 'output'] = value
    for sample in pairs.values():
        if set(sample)=={'input','output'} and not any(s['input'].strip()==sample['input'].strip() and s['output'].strip()==sample['output'].strip() for s in result):
            result.append(sample)
    return result


def statement_fields(data):
    raw = preferred_prose(data, 'descMD', 'description')
    fields = {name:markdown(preferred_prose(data, md, ht)) for name,md,ht in (
        ('input','inputFormatMd','inputFormat'), ('output','outputFormatMd','outputFormat'),
        ('constraints','dataRangeMd','dataRange'), ('tips','tipsMd','tips'))}
    sections = list(SECTIONS.finditer(raw))
    if sections and any(s[1]=='题目描述' for s in sections):
        descriptions = [raw[:sections[0].start()].strip()] if raw[:sections[0].start()].strip() else []
        for index, match in enumerate(sections):
            content = raw[match.end():sections[index+1].start() if index+1<len(sections) else len(raw)].strip()
            name = match[1]
            if name == '题目描述':
                descriptions.append(content)
            elif name in ('输入格式','输出格式','数据范围','数据规模与约定'):
                key = {'输入格式':'input','输出格式':'output','数据范围':'constraints','数据规模与约定':'constraints'}[name]
                if not fields[key]:
                    fields[key] = content
            elif '样例' in name and name.endswith(('解释','说明')):
                fields['tips'] += '\n'+name+'\n'+content
        raw = '\n\n'.join(descriptions)
    # Only remove a sample wrapper if its pair was actually recovered.
    if samples_from(data):
        raw = re.sub(r'<xh-example>.*?</xh-example>', '', raw, flags=re.S)
    fields['description'] = markdown(raw)
    return fields


def image_urls(problem):
    texts = [problem.get(k,'') for k in ('description','input','output','constraints','tips')]
    urls = set()
    for text in texts:
        for match in re.finditer(r'!\[[^\]]*\]\(\s*(<?https?://[^\s)>]+>?)', text):
            urls.add(html.unescape(match[1].strip('<>')))
    return sorted(urls)


def fingerprint(p):
    def clean(text):
        return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text or '')).replace('\\(', '$').replace('\\)', '$')
    content = [clean(p.get(k,'')) for k in ('title','description','input','output','constraints')]
    # Spaces inside sample strings can be meaningful ("a b" is not "ab").
    content += [[s['input'].replace('\r\n','\n').strip('\n'), s['output'].replace('\r\n','\n').strip('\n')] for s in p.get('samples',[])]
    return hashlib.sha256(json.dumps(content, ensure_ascii=False).encode()).hexdigest()


def convert(data, origins):
    row = data['listing']
    ident = data['practiceId']
    origin = origins.get(str(row.get('origin','')), '')
    title = data.get('name') or row['practiceName']
    points = list(dict.fromkeys(row.get('labelList') or []))
    rating = classify(row, title, origin or '平台未标注')
    point_basis = '平台算法标签'
    if ident == SEED_ID:
        points = ['取模', '分类讨论', '最值统计']
        rating.update(level=5, levelStatus='学习参考·已核对解法',
                      levelBasis='利用取模的上界性质缩小候选范围，维护若干不同极值并分类讨论；可线性处理二十万规模，按数论观察归入五级拓展。')
        point_basis = '根据题面与可行解法整理'
    samples = samples_from(data)
    fields = statement_fields(data)
    year = int(row.get('time') or 0)
    if year < 1990 or year > 2100:
        match = re.search(r'(?:NOIP|CSP[ -]?[JS]|NOI|USACO|APIO|省选)[^\n\]]{0,12}?(20\d{2}|199\d)', title+'\n'+fields['constraints'], re.I)
        year = int(match[1]) if match else None
    p = dict(id='xiaohou-bank-'+ident, collection='xiaohou-bank', kind='contest', title=title,
             platformPracticeId=ident, bankCode=str(row.get('code','')), bankOrigin=origin or '平台未标注',
             platformDifficulty=row.get('difficultyStr',''), knowledgePoints=points,
             knowledgePointsBasis=point_basis, year=year,
             session=' · '.join(str(v) for v in (year,origin) if v) or '学而思公开题库',
             number=int(re.sub(r'\D','',str(row.get('code',''))) or 0), occurrences=[],
             source=dict(organization='学而思',
                         url=f'https://www.xiaohoucode.com/problemset/#/compiler/cpp/{ident}?type=subject&localPracticeId=0',
                         note='采集平台：学而思；原题源：'+(origin or '平台未标注')+'。算法标签保留平台值；参考等级不等于官方评级。'),
             **rating, **fields, samples=samples,
             sampleInput=samples[0]['input'] if samples else '', sampleOutput=samples[0]['output'] if samples else '',
             sampleLabel='原题样例',
             casesSource='仅原题公开样例；未取得平台隐藏评测数据。' if samples else '平台没有返回可提取的输入输出样例；暂无本地评测点。',
             judgeDataStatus='samples-only' if samples else 'unavailable',
             timeLimitSeconds=data.get('limitRunTime'), memoryLimitMB=data.get('limitMemory'))
    n = len(samples)
    p['cases'] = [dict(input=s['input'], expected=s['output'], score=100//n+(i<100%n),
                       label=f'原题样例 {i+1}', source='statement_sample') for i,s in enumerate(samples)]
    p['tags'] = ['来源：学而思','题库：C++竞赛题库','原题源：'+p['bankOrigin']]
    if p['platformDifficulty']:
        p['tags'].append('原难度：'+p['platformDifficulty'])
    if year:
        p['tags'].append('年份：'+str(year))
    p['tags'] += points + [f"GESP {p['level']} 级（参考）" if p['level'] else p['levelStatus']]
    p['assets'] = [dict(sourceUrl=url) for url in image_urls(p)]
    return p


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--allow-partial', action='store_true', help='Only for conversion previews; do not publish')
    parser.add_argument('--project', action='store_true', help='Install the normalized records into the project')
    args = parser.parse_args()
    directory = args.directory
    download = json.loads((directory/'summary.json').read_text())
    if download['status'] != 'complete' and not args.allow_partial:
        raise ValueError('Download must finish before final conversion')
    labels = json.loads((directory/'labels.json').read_text())
    origins = {str(row['id']):row['name'] for row in labels['originList']}
    records = sorted((directory/'records').glob('*.json'))
    problems, errors = [], []
    for file in records:
        try:
            p = convert(json.loads(file.read_text()), origins)
            if not p['description']:
                raise ValueError('Empty problem statement')
            problems.append(p)
        except (KeyError, ValueError, TypeError) as error:
            errors.append(dict(file=file.name, error=str(error)))
    dump(directory/'conversion-errors.json', errors)
    if errors:
        raise ValueError(f'{len(errors)} conversion errors; original records preserved')
    asset_file = directory/'assets/images/manifest.json'
    assets = json.loads(asset_file.read_text()) if asset_file.exists() else {}
    aliases, seen, unique = [], {}, []
    existing = []
    for name in ('gesp','csp'):
        catalog = json.loads((EXTENSION/f'data/{name}/index.json').read_text())
        for item in catalog['problems']:
            original = json.loads((EXTENSION/item['file']).read_text())
            seen[fingerprint(original)] = item['id']
            existing.append(item)
    for p in problems:
        key = fingerprint(p)
        if key in seen:
            aliases.append(dict(id=p['id'], canonicalId=seen[key], title=p['title'], source=p['source'],
                                bankCode=p['bankCode'], bankOrigin=p['bankOrigin'], knowledgePoints=p['knowledgePoints']))
            continue
        seen[key] = p['id']
        unique.append(p)
    dump(directory/'problems.json', problems)
    dump(directory/'duplicates.json', aliases)
    dump(directory/'image-urls.json', sorted({a['sourceUrl'] for p in problems for a in p['assets']}))
    catalog = []
    for p in unique:
        local = copy.deepcopy(p)
        for asset in local['assets']:
            cached = assets.get(asset['sourceUrl'])
            if cached and cached.get('status') == 'ok':
                dest = 'data/xiaohou-bank/assets/images/'+cached['file']
                asset['localPath'] = dest
                for key in ('description','input','output','constraints','tips'):
                    local[key] = local[key].replace(asset['sourceUrl'], dest)
                if args.project:
                    target = EXTENSION/dest
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(directory/'assets/images'/cached['file'], target)
        file = 'data/xiaohou-bank/problems/'+local['id']+'.json'
        if args.project:
            dump(EXTENSION/file, local)
        keys = ('id','collection','group','level','levelStatus','levelBasis','groupBasis','cspDifficulty','kind','title',
                'tags','knowledgePoints','session','number','bankOrigin','bankCode','platformDifficulty','year')
        catalog.append({**{key:local[key] for key in keys}, 'file':file})
    summary = dict(downloaded=len(problems), uniqueImported=len(unique), duplicates=len(aliases),
                   samples=sum(len(p['samples']) for p in unique), noSamples=sum(not p['samples'] for p in unique),
                   groups=dict(Counter(p['group'] for p in unique)),
                   levels=dict(Counter(str(p['level']) for p in unique)),
                   classificationStatus=dict(Counter(p['levelStatus'] for p in unique)),
                   imageCount=len({a['sourceUrl'] for p in problems for a in p['assets']}),
                   source='学而思', scope='C++ 竞赛题库；公开样例，不含隐藏评测数据。',
                   partial=download['status']!='complete')
    index = dict(version=1, updatedAt='2026-11-19', summary=summary, problems=catalog)
    dump(directory/'catalog.json', index)
    if args.project:
        dump(EXTENSION/'data/xiaohou-bank/index.json', index)
        if download['status']=='complete':
            expected={p['id']+'.json' for p in catalog}
            for old in (EXTENSION/'data/xiaohou-bank/problems').glob('xiaohou-bank-*.json'):
                if old.name not in expected:
                    old.unlink()
    with (directory/'题目索引.csv').open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.writer(output)
        writer.writerow(['ID','题号','题名','来源','原题源','原难度','知识点','训练分组','GESP参考级','归级状态','归级依据','样例数','来源链接'])
        for p in problems:
            row = [p['id'],p['bankCode'],p['title'],'学而思',p['bankOrigin'],p['platformDifficulty'],'、'.join(p['knowledgePoints']),p['group'],p['level'] or '',p['levelStatus'],p['levelBasis'],len(p['samples']),p['source']['url']]
            writer.writerow(["'"+v if isinstance(v,str) and v.startswith(('=','+','-','@')) else v for v in row])
    dump(directory/'import-summary.json', summary)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
