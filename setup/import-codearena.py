"""Import CodeArena's distributable files, excluding machine state and personal data."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    target = ROOT / 'extension'
    if target.exists():
        raise SystemExit('extension already exists; refusing to overwrite this installation.')
    names = ['manifest.json', 'background.js', 'index.html', 'app.js', 'styles.css',
             'problem.json', 'README.md', 'package.json', '.gitignore', 'install-all.bat',
             'install-all.ps1', 'enable-page-start.bat', 'start-learning.bat',
             'restart-learning.bat', 'start-learning.ps1']
    files = {Path(name): source / name for name in names}
    for folder in ['ui', 'vendor', 'data']:
        for path in (source / folder).rglob('*'):
            if path.is_file():
                files[path.relative_to(source)] = path
    for pattern in ['learning_service/*.py', 'tests/*.py', 'tests/*.mjs', 'tests/*.ps1']:
        for path in source.glob(pattern):
            files[path.relative_to(source)] = path
    files[Path('learning_service/config.json')] = source / 'learning_service/config.json'
    for name in ['windows-dependencies.ps1', 'find-compiler.ps1', 'bootstrap-windows.ps1',
                 'windows-installers.json', 'check-native-host.py', 'service-process.ps1',
                 'launch-learning.ps1', 'register-page-control.ps1']:
        files[Path('scripts') / name] = source / 'scripts' / name
    for name in ['host.py', 'judge.py', 'debugger.py', 'gdb_support.py', 'install-host.ps1',
                 'build-host.bat', 'dist/codearena_host.exe']:
        files[Path('native-host') / name] = source / 'native-host' / name
    for name in ['install-windows.md', 'verification.md', 'learning-api.md']:
        files[Path('docs') / name] = source / 'docs' / name
    missing = [str(path) for path in files.values() if not path.is_file()]
    if missing:
        raise SystemExit('Missing source files: ' + ', '.join(missing))
    for relative, path in sorted(files.items()):
        if any(part in {'.local', '.venv', '.env', '__pycache__', 'releases', '.tmp'} for part in relative.parts):
            raise SystemExit('Unexpected private/cache path: ' + str(relative))
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
    report = {
        'source': str(source), 'version': json.loads((target / 'manifest.json').read_text('utf-8'))['version'],
        'files': {path.as_posix(): hashlib.sha256(value.read_bytes()).hexdigest() for path, value in sorted(files.items())},
        'excluded': ['.env', '.local', '.venv', 'config.local.json', 'native host registration/config',
                     'old parent installer', 'No_Compiler installer', 'build caches', 'release archives'],
    }
    (ROOT / 'codearena-import.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files': len(files), 'bytes': sum(p.stat().st_size for p in files.values()), 'destination': str(target)}))


if __name__ == '__main__':
    main()
