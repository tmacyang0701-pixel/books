"""Small overlay for existing Windows bundles; never contains user settings."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    'PYTHON-LOCAL-FIX.txt',
    'gesp-lab-extension/install-all.ps1',
    'gesp-lab-extension/scripts/bootstrap-windows.ps1',
    'gesp-lab-extension/scripts/windows-dependencies.ps1',
    'gesp-lab-extension/scripts/python-runtime.ps1',
    'gesp-lab-extension/scripts/python-runtime.json',
    'python/python-3.14.10-win-x64.nupkg',
]


def main():
    target = ROOT / 'dist' / 'books-python-local-fix.zip'
    target.parent.mkdir(exist_ok=True)
    hashes = {}
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            data = (ROOT / name).read_bytes()
            archive.writestr(name, data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        archive.writestr('PYTHON-FIX-SHA256.txt', ''.join(f'{value}  {name}\n' for name, value in hashes.items()))
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        for name, expected in hashes.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected, name
    print(f'{target}\nVerified {len(FILES)} files; {target.stat().st_size / 1024 / 1024:.1f} MiB')


if __name__ == '__main__':
    main()
