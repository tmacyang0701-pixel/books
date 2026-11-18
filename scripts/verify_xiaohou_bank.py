#!/usr/bin/env python3
"""Check full-export accounting, project records, public samples and cached assets."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

from export_xiaohou_bank import dump
from import_xiaohou_bank import ROOT, EXTENSION

sys.path.insert(0, str(EXTENSION))
from learning_service.server import normalize_problem


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    folder = args.directory
    download = json.loads((folder/'summary.json').read_text())
    summary = json.loads((folder/'import-summary.json').read_text())
    problems = json.loads((folder/'problems.json').read_text())
    catalog = json.loads((EXTENSION/'data/xiaohou-bank/index.json').read_text())
    aliases = json.loads((folder/'duplicates.json').read_text())
    manifest = json.loads((folder/'assets/images/manifest.json').read_text())
    assert download['status']=='complete' and not summary['partial'] and download['errors']==0
    assert len(problems)==download['serverTotal']==download['downloaded']==summary['downloaded']
    ids = {p['id'] for p in problems}
    imported = {p['id'] for p in catalog['problems']}
    duplicate_ids = {p['id'] for p in aliases}
    assert len(ids)==len(problems) and not imported&duplicate_ids
    assert imported|duplicate_ids == ids
    known = set(imported)
    for name in ('gesp','csp'):
        known.update(p['id'] for p in json.loads((EXTENSION/f'data/{name}/index.json').read_text())['problems'])
    assert all(p['canonicalId'] in known for p in aliases)
    files = set((EXTENSION/'data/xiaohou-bank/problems').glob('*.json'))
    assert files == {EXTENSION/p['file'] for p in catalog['problems']}
    samples = 0
    for row in catalog['problems']:
        p = json.loads((EXTENSION/row['file']).read_text())
        normalized = normalize_problem(p)
        for field in ('id','collection','group','level','knowledgePoints','samples','cases','tips'):
            assert normalized[field] == p[field], (row['id'],field)
        assert len(p['samples'])==len(p['cases'])
        assert sum(c['score'] for c in p['cases'])==(100 if p['cases'] else 0)
        for sample,case in zip(p['samples'],p['cases']):
            assert sample['input']==case['input'] and sample['output']==case['expected']
        assert '来源：学而思' in p['tags'] and p['levelBasis']
        for asset in p['assets']:
            cached_asset=manifest.get(asset['sourceUrl'],{})
            if cached_asset.get('status')=='ok':
                expected='data/xiaohou-bank/assets/images/'+cached_asset['file']
                assert asset.get('localPath')==expected, row['id']
                assert (EXTENSION/expected).is_file(), expected
        samples += len(p['samples'])
    assert samples==summary['samples']
    urls = set(json.loads((folder/'image-urls.json').read_text()))
    assert urls == manifest.keys(), 'Not all referenced image links have been checked'
    cached = 0
    for url, asset in manifest.items():
        if asset['status']=='ok':
            raw = (folder/'assets/images'/asset['file']).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==asset['sha256']
            project_file=EXTENSION/'data/xiaohou-bank/assets/images'/asset['file']
            # A cached image used only by a duplicate may legitimately stay in the export.
            if project_file.exists():
                assert project_file.read_bytes()==raw
            cached += 1
    # Sanitized raw records must not retain account/session or user submission fields.
    denied = {'authorization','token','userId','userCode','sourcePath','sourceRef','collect','result'}
    for f in (folder/'records').glob('*.json'):
        assert not denied.intersection(json.loads(f.read_text())), f.name
    report=dict(status='passed',downloaded=len(problems),imported=len(imported),duplicateAliases=len(aliases),
                publicSamples=samples,imageUrls=len(urls),cachedImages=cached,unavailableImages=len(urls)-cached,
                checks=['下载总数与完整状态','去重集合及原题映射','全部项目题目规范化','样例输入输出与评测点逐一一致',
                        '样例分值合计','来源及归级依据','配图完整记录和 SHA-256','原始字段白名单'],
                limits='未获取隐藏评测数据，未逐题运行解法；等级主要按平台标签参考映射。')
    dump(folder/'verification.json',report)
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
