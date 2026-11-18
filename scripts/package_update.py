"""Package this workspace's cumulative changes as a Windows overlay."""
import hashlib
import json
import argparse
import subprocess
import zipfile
from package_windows import ROOT, files, entry


def git_names(*args):
    output = subprocess.check_output(['git', *args, '-z'], cwd=ROOT)
    return {name.decode('utf-8') for name in output.split(b'\0') if name}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank', action='store_true', help='Include and validate the completed C++ bank import')
    args = parser.parse_args()
    bank = None
    if args.bank:
        bank = json.loads((ROOT/'gesp-lab-extension/data/xiaohou-bank/index.json').read_text())
        assert not bank['summary']['partial'], 'Finish the question bank download before packaging'
    changed = git_names('diff', 'HEAD', '--name-only', '--diff-filter=ACMRT')
    changed |= git_names('ls-files', '--others', '--exclude-standard')
    # Also replace the Chinese entry points if an older ZIP garbled their names.
    changed |= {p.name for p in ROOT.iterdir() if p.suffix in {'.bat', '.cmd'}}
    changed |= {'setup/stop-codearena.ps1', 'gesp-lab-extension/scripts/bundle-runtime.ps1'}
    selected = []
    for path, name in files():
        if name not in changed or name.startswith(('scripts/', 'setup-tests/')):
            continue
        if 'tests' in path.relative_to(ROOT).parts or path.name == '.gitignore':
            continue
        if path.name.startswith('build_xiaohou'):
            continue
        selected.append((path, name))

    instructions = '''CodeArena Windows 累计更新包 · 2026-11-19

适用于现有 books 整合包，不能单独安装。

更新步骤
1. 关闭安装窗口和扩展页面，运行原目录中的“停止CodeArena后台.bat”。
2. 解压本更新包。把解压出来的所有文件和文件夹，复制到原来“一键安装.bat”所在目录，合并并覆盖同名文件。
   按此次报错，目标目录为 C:\\Users\\86159\\Desktop\\gesp\\CodeArena\\books\\books\\。
   不要删除原文件夹，不要再套一层 books 文件夹。
3. 双击该目录下的“一键安装.bat”。
4. 在 chrome://extensions 重新加载已安装的 GESP、物理和化学扩展，再打开页面。
   首次使用化学扩展时，选择“加载已解压的扩展程序”，选当前目录的 chemistry-lab-extension。

包含的更新
- Python：3.10 以上、64 位且必要组件可用就跳过；不可用时只解压本项目的 Python 3.14.10，不卸载系统版本，不调用 Python EXE/MSI。
- 语音：GESP 和物理聊天的启动异常、超时恢复、错误提示与草稿保留。仍需 Windows 麦克风权限及浏览器语音服务正常可达。
- 化学：液体抬高和拖放倾倒、组合与前置步骤检查、警告弹窗、重置、成功提示及自动演示。
- GESP：学而思题目、来源标签、来源筛选，以及样例和评测数据。
- 赛事题库：本地 JSON 自动载入 115 道学而思赛事题（100 编程、15 理论），新增 CSP-J / CSP-S 分组，保留年份、季节、第几周、原组别及知识点筛选；理论题支持选项和答案核对。
- 按主知识点归入 GESP 1～8 级，新增题数依次为 6、8、21、12、32、22、13、1；同一题共用数据，题面说明归级依据和“学习参考”。已有 10 道五级课程题保持原分类。
- 本批 CSP-J 共 115 道（含基础训练），CSP-S 暂无题目；没有把普及进阶组当成提高组。编程题包含 290 组公开样例，未取得隐藏评测点。
- C++ 本地评测：临时 program.exe 被占用时重试清理；清理失败只记日志，不覆盖真实运行结果或分数，补充超时终止检查。

更新包不包含用户密钥、浏览器学习记录、.env、.venv 或 .local 数据。
旧项目里不可用的 Python 环境会先备份再替换。
若仍显示“Installing python. Accept the Windows UAC prompt”，说明运行的仍是旧脚本，请核对覆盖位置。
Python 本地解压日志：gesp-lab-extension\\.local\\python-runtime.log。

校验与限制
包内 UPDATE-MANIFEST.json 列出每个更新文件的 SHA-256。
已通过相关自动测试、PowerShell 解压与安装分发检查；Windows 可执行程序仍需在 Windows 实机运行验证。
'''
    if bank:
        summary = bank['summary']
        instructions = instructions.replace('- 本批 CSP-J 共 115 道（含基础训练），CSP-S 暂无题目；没有把普及进阶组当成提高组。编程题包含 290 组公开样例，未取得隐藏评测点。',
            '- 之前的 115 道赛事题保留原分类和 290 组公开样例。')
        instructions += f'''
C++ 题库新增
读取学而思 C++ 题库 {summary['downloaded']} 道，去重后新增 {summary['uniqueImported']} 道，含 {summary['samples']} 组公开样例。
题库分组选择“学而思题库（全部）”，可按原题来源、原难度、知识点筛选；每页 200 道。
新增题目保存于 gesp-lab-extension/data/xiaohou-bank/，随项目自动载入，无需逐题导入 JSON。
CSP-J / CSP-S 训练归类不改变原题来源；原平台难度、知识点及分类依据均保留。
GESP 等级以知识点保守映射，标记“标签参考·未逐题复核”；缺少依据或超出范围的题放入“待归级／竞赛拓展”。
本批是题库题，不虚构赛事周次；原有赛事周次筛选保留。
接口没有返回隐藏评测数据；本地评测使用公开样例，{summary['noSamples']} 道没有可提取样例的题仅支持手动输入运行。
本地只支持标准输入输出和样例文本比较；交互题、提交答案题和特殊判题需按原平台要求完成。
配图尽量缓存；无法下载的历史链接保留为“查看原题配图”，原站失效的图片仍可能无法打开。
为保留原题的大样例，单个测试点输入／预期输出上限提高到 100,000 字符。
'''
    output = ROOT / 'dist' / ('books-bank-update-20261119.zip' if bank else 'books-update-20261119.zip')
    output.parent.mkdir(exist_ok=True)
    temporary = output.with_suffix('.zip.partial')
    hashes = {}
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, name in sorted(selected, key=lambda pair: pair[1]):
            data = path.read_bytes()
            archive.writestr(entry(name, prefix=''), data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        readme = instructions.encode('utf-8-sig')
        archive.writestr(entry('更新说明.txt', prefix=''), readme)
        hashes['更新说明.txt'] = hashlib.sha256(readme).hexdigest()
        manifest = {'type': 'cumulative-overlay', 'date': '2026-11-19', 'files': hashes}
        archive.writestr('UPDATE-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8'))
    with zipfile.ZipFile(temporary) as archive:
        assert archive.testzip() is None
        for name, expected in hashes.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected, name
            if not name.isascii():
                assert archive.getinfo(name).flag_bits & 0x800, name
        for required in ['一键安装.bat', 'python/python-3.14.10-win-x64.nupkg',
                         'gesp-lab-extension/scripts/python-runtime.ps1',
                         'gesp-lab-extension/ui/chat-voice.js', 'physics-lab-extension/src/chat-voice.js',
                         'chemistry-lab-extension/modules/completion.js', 'gesp-lab-extension/ui/library-filters.js',
                         'gesp-lab-extension/data/csp/index.json', 'gesp-lab-extension/ui/csp-library.js']:
            assert required in hashes, required
        catalog = json.loads(archive.read('gesp-lab-extension/data/csp/index.json'))
        assert len(catalog['problems']) == 115
        for problem in catalog['problems']:
            assert 'gesp-lab-extension/' + problem['file'] in hashes
        if bank:
            assert 'gesp-lab-extension/data/xiaohou-bank/index.json' in hashes
            for problem in bank['problems']:
                name = 'gesp-lab-extension/' + problem['file']
                assert name in hashes, name
                detail = json.loads(archive.read(name))
                for asset in detail.get('assets', []):
                    if asset.get('localPath'):
                        assert 'gesp-lab-extension/'+asset['localPath'] in hashes, asset
    temporary.replace(output)
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{checksum}  {output.name}\n')
    print(f'{output}\nVerified {len(hashes)} update files; {output.stat().st_size / 1024 / 1024:.1f} MiB')


if __name__ == '__main__':
    main()
