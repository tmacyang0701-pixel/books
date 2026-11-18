#!/usr/bin/env python3
"""Package sanitized bank records, normalized JSON, public samples and images."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

from package_windows import entry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    folder = args.directory
    summary = json.loads((folder/'import-summary.json').read_text())
    assert not summary['partial'], 'A partial export must not be published'
    assert json.loads((folder/'summary.json').read_text())['status'] == 'complete'
    problems = json.loads((folder/'problems.json').read_text())
    assert len(problems) == summary['downloaded']
    assets = json.loads((folder/'assets/images/manifest.json').read_text())
    urls = json.loads((folder/'image-urls.json').read_text())
    assert set(urls) <= assets.keys(), 'Image cache has not finished checking every URL'
    cached = sum(v['status']=='ok' for v in assets.values())
    readme = f'''学而思 C++ 题库导出 · 2026-11-19

账号正常题库接口返回 {summary['downloaded']} 道；项目去重后新增 {summary['uniqueImported']} 道。
problems.json：全部题目标准化数据，包含题面、输入输出格式、数据范围、样例、样例评测点、来源、原题源、原难度、知识点及归级依据。
records/：原接口题目内容的白名单字段，保留原始 Markdown/HTML；不含账号凭据、用户代码、提交记录或答案接口数据。
题目索引.csv：UTF-8 BOM 编码，Windows Excel 可直接打开；包含全部原题，重复映射见 duplicates.json。
samples/题目ID/：公开样例 .in / .out，文件编号与 problems.json 的 samples 数组顺序相同。
catalog.json：去重索引（file 字段指向项目目录）；要直接使用，请覆盖同批项目更新包。
assets/images/manifest.json：配图原链接到本地文件映射、校验值或下载失败原因。
原题配图共 {len(urls)} 个唯一链接，缓存成功 {cached} 个；其余链接保留，部分历史原站已失效。

评测与分类
项目新增题目包含 {summary['samples']} 组公开样例；{summary['noSamples']} 道没有可提取样例。
未取得平台隐藏评测数据。样例分数用于练习，不代表通过完整数据。
本地只支持标准输入输出和样例文本比较；交互题、提交答案题和特殊判题需按原平台要求完成。
原平台知识点标签保留；GESP 等级是保守标签映射，除明确标记“已核对解法”外均未逐题复核。
缺少可靠依据标记“待归级”，高级竞赛内容标记“竞赛拓展”，不强行塞入 GESP 等级。
CSP-J / CSP-S 是训练分组；groupBasis 说明依据，bankOrigin 保留原题出处，不冒充相应赛事原题。
普通题库题不填写虚构周次；之前已导入赛事题的周次保持原样。

使用项目
同批 books-bank-update-20261119.zip 合并覆盖原 books 目录后，重载 GESP 扩展并重启后台。
题库选择“学而思题库（全部）”，或按 CSP、GESP 参考等级、待归级／竞赛拓展查找。
此导出 ZIP 用于备份、检索和程序批量读取；应用的单题 JSON 导入入口不接受整个数组。
'''
    (folder/'导出说明.txt').write_text(readme, encoding='utf-8-sig')
    output = folder.with_suffix('.zip')
    temporary = output.with_suffix('.zip.partial')
    hashes = {}
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        def add(name, data):
            archive.writestr(entry(name, prefix=''), data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        for name in ('summary.json','import-summary.json','labels.json','listings.json','problems.json',
                     'duplicates.json','catalog.json','image-urls.json','conversion-errors.json','verification.json','题目索引.csv','导出说明.txt'):
            path = folder/name
            if path.exists():
                add(name, path.read_bytes())
        for path in sorted((folder/'records').glob('*.json')):
            add(path.relative_to(folder).as_posix(), path.read_bytes())
        add('assets/images/manifest.json', (folder/'assets/images/manifest.json').read_bytes())
        for asset in assets.values():
            if asset['status']=='ok':
                name = 'assets/images/'+asset['file']
                raw = (folder/name).read_bytes()
                assert hashlib.sha256(raw).hexdigest() == asset['sha256'], name
                add(name, raw)
        for p in problems:
            for index, sample in enumerate(p['samples'], 1):
                for suffix, field in (('in','input'),('out','output')):
                    add(f"samples/{p['id']}/{index:02}.{suffix}", sample[field].encode('utf-8'))
        archive.writestr('SHA256SUMS.json', json.dumps(hashes, ensure_ascii=False, indent=2).encode('utf-8'))
    with zipfile.ZipFile(temporary) as archive:
        assert archive.testzip() is None
        for name, expected in hashes.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected, name
            if not name.isascii():
                assert archive.getinfo(name).flag_bits & 0x800, name
    temporary.replace(output)
    output.with_suffix('.zip.sha256').write_text(hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name+'\n')
    print(f'{output}: {len(hashes)} verified files; {output.stat().st_size/1024/1024:.1f} MiB')


if __name__ == '__main__':
    main()
