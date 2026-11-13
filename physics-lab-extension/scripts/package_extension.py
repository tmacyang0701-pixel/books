"""白名单打包可加载扩展与维护源码；不收集临时目录和用户数据。"""
from pathlib import Path
import json
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
files = [root / name for name in ['manifest.json', 'background.js', 'index.html', 'styles.css', 'exams.css', 'tutor.css', 'README.md', 'package.json', 'package-lock.json']]
for directory in ['src', 'icons', 'docs', 'scripts']:
    files.extend(path for path in sorted((root / directory).rglob('*')) if path.is_file())
output = root / 'dist' / f"physics-lab-extension-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, Path('physics-lab-extension') / file.relative_to(root))
print(f'已打包 {len(files)} 个文件：{output.name}')
