"""Build a Windows ZIP with explicit Unicode filenames and verified contents."""
from pathlib import Path
import hashlib
import os
import struct
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist' / 'books-windows.zip'
SKIP_DIRS = {
    '.git', '__MACOSX', '.setup', '.local', '.tmp', '.venv', 'node_modules',
    '__pycache__', '.pytest_cache', '.playwright', '.aws', '.codex', '.agents',
}
SKIP_FILES = {
    '.DS_Store', 'runtime-selection.json', 'installation-report.json',
    'config.local.json', 'com.codearena.cpp_judge.json',
    'StartupProfileData-NonInteractive',
}


def files():
    for directory, dirs, names in os.walk(ROOT, followlinks=False):
        base = Path(directory)
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS
                         and not d.startswith('.venv.unusable-')
                         and not (base / d).is_symlink()
                         and base / d != OUTPUT.parent)
        for name in sorted(names):
            path = base / name
            if path.is_symlink() or name in SKIP_FILES or name.startswith('._'):
                continue
            if name.endswith(('.pyc', '.log')):
                continue
            if name.startswith('.env') and name not in {'.env.example', '.env.sample', '.env.template'}:
                continue
            relative = path.relative_to(ROOT).as_posix()
            if relative in {'SHA256SUMS.txt', 'gesp-lab-extension/native-host/dist/config.json'}:
                continue
            yield path, relative


def entry(name, prefix='books/'):
    info = zipfile.ZipInfo(prefix + name)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 0  # Windows archive; do not carry Mac metadata.
    info.external_attr = 0x20
    # zipfile writes the UTF-8 flag (bit 11) for non-ASCII names. Include
    # the Unicode Path field as well for readers that support this extension.
    raw = info.filename.encode('utf-8')
    if not info.filename.isascii():
        payload = struct.pack('<BI', 1, zlib.crc32(raw)) + raw
        info.extra = struct.pack('<HH', 0x7075, len(payload)) + payload
    return info


def main():
    OUTPUT.parent.mkdir(exist_ok=True)
    temporary = OUTPUT.with_suffix('.zip.partial')
    hashes = {}
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path, name in files():
            digest = hashlib.sha256()
            with path.open('rb') as source, archive.open(entry(name), 'w') as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
                    digest.update(chunk)
            hashes[name] = digest.hexdigest()
        manifest = ''.join(f'{value}  {name}\n' for name, value in sorted(hashes.items()))
        archive.writestr(entry('SHA256SUMS.txt'), manifest.encode('utf-8'))

    chinese_names = 0
    with zipfile.ZipFile(temporary) as archive, temporary.open('rb') as raw:
        assert archive.testzip() is None, 'ZIP content CRC verification failed'
        for info in archive.infolist():
            if not info.filename.isascii():
                chinese_names += 1
                assert info.flag_bits & 0x800, info.filename
                raw.seek(info.header_offset + 6)
                assert struct.unpack('<H', raw.read(2))[0] & 0x800, info.filename
            name = info.filename.removeprefix('books/')
            if name in hashes:
                with archive.open(info) as source:
                    digest = hashlib.sha256()
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
                assert digest.hexdigest() == hashes[name], name
        assert 'books/一键安装.bat' in archive.namelist()
        assert 'books/打开GESP.cmd' in archive.namelist()
    temporary.replace(OUTPUT)
    print(f'{OUTPUT}\nVerified {len(hashes)} files; {chinese_names} Unicode filenames; '
          f'{OUTPUT.stat().st_size / 1024 / 1024:.1f} MiB')


if __name__ == '__main__':
    main()
