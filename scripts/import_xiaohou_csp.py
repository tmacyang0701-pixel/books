#!/usr/bin/env python3
"""Build the project's CSP catalog from the previously exported local JSON."""
import argparse
import copy
from collections import Counter
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1] / 'gesp-lab-extension'


class Prose(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'div', 'br', 'tr', 'li'):
            self.parts.append('\n')
        if tag == 'img':
            a = dict(attrs)
            self.parts.append('\n![题目配图](' + a.get('src', '') + ')\n')
        if tag == 'sup':
            self.parts.append('^(')

    def handle_endtag(self, tag):
        if tag in ('p', 'div', 'tr', 'li'):
            self.parts.append('\n')
        if tag == 'sup':
            self.parts.append(')')

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = Prose()
    parser.feed(value or '')
    return re.sub(r'\n{3,}', '\n\n', ''.join(parser.parts)).strip()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export_directory', type=Path)
    args = parser.parse_args()
    source = args.export_directory
    problems = json.loads((source / 'problems.json').read_text())
    ratings = json.loads(Path(__file__).with_name('xiaohou-contest-levels-20261119.json').read_text())
    keys = {p['id'].removeprefix('xiaohou-competition-') for p in problems}
    if keys != ratings['problems'].keys():
        raise ValueError('Each exported problem must have exactly one reviewed classification')
    manifest = json.loads((source / 'assets/images/manifest.json').read_text())
    images = {u: 'data/csp/assets/images/' + v['file'] for u, v in manifest.items() if v['status'] == 'ok'}
    destination = ROOT / 'data/csp'
    for uri, target in images.items():
        path = ROOT / target
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / 'assets/images' / Path(target).name, path)

    def relocate(text):
        for uri, target in images.items():
            text = text.replace(uri, target)
        # Some Markdown statements include HTML image wrappers.
        text = re.sub(r'<img\b[^>]*>', lambda m: plain(m[0]), text, flags=re.I)
        return re.sub(r'</?center[^>]*>', '', text, flags=re.I)

    catalog = []
    for original in problems:
        p = copy.deepcopy(original)
        p.pop('contentHtml', None)
        p.pop('questionData', None)
        p.pop('exportKey', None)
        occurrences = p['occurrences']
        p['group'] = 'csp-s' if any('提高' in r['group'] for r in occurrences) else 'csp-j'
        p['groupBasis'] = '按原赛事组别归类，非官方难度评级'
        level, difficulty, reason = ratings['problems'][p['id'].removeprefix('xiaohou-competition-')]
        assert type(level) is int and 1 <= level <= 8
        p['level'] = level
        p['levelBasis'] = reason
        p['levelStatus'] = '学习参考'
        p['cspDifficulty'] = 'CSP-J ' + difficulty + '训练'
        p['classificationReferences'] = ratings['references']
        p['kind'] = 'theory' if p['kind'] == 'theory' else 'contest'
        latest = max(occurrences, key=lambda r: (r['year'], r['season'] == '秋季', r['week']))
        p['session'] = latest['periodLabel']
        p['number'] = latest['number']
        p['sampleLabel'] = '原题样例'
        p['casesSource'] = ('答案来自平台返回数据。' if p['kind'] == 'theory' else
                            '仅原题公开样例；通过样例不代表通过平台完整评测。')
        p['sampleInput'] = p['samples'][0]['input'] if p['samples'] else ''
        p['sampleOutput'] = p['samples'][0]['output'] if p['samples'] else ''
        n = len(p['cases'])
        for i, case in enumerate(p['cases']):
            case['score'] = 100 // n + (i < 100 % n)
        p['source'] = {'organization': '学而思', 'url': latest['sourceUrl'],
                       'note': '已按原赛事年份、季节、周次和组别整理。知识点由题面整理，非平台原标签。'}
        p['tags'] = list(dict.fromkeys([*p['tags'], '分组：' + p['group'].upper(),
                                      f'GESP {level} 级（学习参考）', p['cspDifficulty'] + '（参考）']))
        for key in ('description', 'input', 'output', 'constraints', 'tips'):
            p[key] = relocate(plain(p.get(key, '')) if p['kind'] == 'theory' else p.get(key, ''))
        if p['kind'] == 'theory':
            def options(value):
                if isinstance(value, list):
                    return [x for v in value for x in options(v)]
                if isinstance(value, dict):
                    return [{'label': str(value.get('aoVal') or value.get('no') or ''),
                             'text': relocate(plain(value.get('content') or value.get('value') or ''))}]
                return []
            p['options'] = options(p['options'])
            def answers(value):
                if isinstance(value, list):
                    return [x for v in value for x in answers(v)]
                return [str(value)] if value is not None else []
            p['answer'] = answers(p['answer'])
            p['analysis'] = relocate(plain(p.get('analysis', '')))
        for asset in p.get('assets', []):
            asset['localPath'] = images[asset['sourceUrl']]
        file = f"data/csp/problems/{p['id']}.json"
        write(ROOT / file, p)
        catalog.append({**{key: p[key] for key in ('id', 'group', 'level', 'levelBasis', 'levelStatus', 'cspDifficulty', 'kind', 'title', 'tags', 'knowledgePoints', 'session', 'number', 'occurrences')}, 'file': file})
    assert len({p['id'] for p in catalog}) == len(catalog) == 115
    write(destination / 'index.json', {'version': 1, 'updatedAt': '2026-11-19',
          'groups': [{'id': 'csp-j', 'title': 'CSP-J', 'description': '基础、普及及入门初赛题'},
                     {'id': 'csp-s', 'title': 'CSP-S', 'description': '提高组题目'}],
          'scope': '学而思赛事题 115 道：100 道编程题、15 道理论题。编程评测仅含 290 组原题样例。当前未取得提高组题目。',
          'classification': {'basis': ratings['basis'], 'references': ratings['references'],
                             'levels': dict(sorted(Counter(p['level'] for p in catalog).items())),
                             'difficulty': dict(Counter(p['cspDifficulty'] for p in catalog))},
          'problems': catalog})
    print(json.dumps({'imported': len(catalog), 'csp-j': sum(p['group'] == 'csp-j' for p in catalog),
                      'csp-s': sum(p['group'] == 'csp-s' for p in catalog),
                      'gespLevels': dict(sorted(Counter(p['level'] for p in catalog).items()))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
