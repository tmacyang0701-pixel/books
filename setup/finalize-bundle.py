"""Refresh distribution metadata/checksums without including machine state or secrets."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {'.local', '.venv', '.tmp', '.setup', '__pycache__', '.pytest_cache', '.git', 'node_modules'}
EXCLUDED_FILES = {'.env', 'config.local.json', 'com.codearena.cpp_judge.json'}
STATE_FILES = {'runtime-selection.json', 'installation-report.json', 'SHA256SUMS.txt'}


def main():
    manifest = {
        'schema': 2,
        'platform': 'Windows 10 1809+ / Windows 11, x64',
        'primaryApplication': 'CodeArena GESP',
        'version': '3.0.0',
        'extensionDirectory': 'gesp-lab-extension',
        'installer': '一键安装.bat',
        'installerAliases': ['一键安装.cmd', 'install-all.cmd'],
        'launcher': '打开GESP.cmd',
        'environmentCheck': 'detect-environment.cmd',
        'dependencies': {
            'chrome': 'Reuse installed Chrome; signed official download if absent',
            'python': '3.10+ with ssl/sqlite3/venv; reuse selected runtime or registry installation',
            'pypdf': '6.11.0; includes typing_extensions 4.15.0 for Python 3.10; PyPI-verified wheels installed into project venv',
            'cpp': 'g++ with real C++17 compile/run validation',
            'gdb': 'Working GDB with Python support and native debug validation',
            'nativeHost': 'Auditable Python source through start-host.bat and project venv; no packaged EXE or PyInstaller required',
            'node': 'Not required for GESP',
        },
        'bundledInstallers': {
            'python': 'python/python-3.14.10-amd64.exe',
            'cppToolchain': 'devcpp/Embarcadero_Dev-Cpp_6.3_TDM-GCC_9.2_Setup.exe',
            'pypdf': 'python/wheels/pypdf-6.11.0-py3-none-any.whl',
            'typingExtensions': 'python/wheels/typing_extensions-4.15.0-py3-none-any.whl',
        },
        'installation': {
            'offline': False,
            'bundledPythonCppAndPdf': True,
            'networkRequired': ['Chrome download if absent', 'Bailian connectivity and AI features'],
            'requiresUserSteps': ['Load gesp-lab-extension directory in Chrome developer mode', 'Configure own API key if missing'],
            'skipAdequateExisting': True,
            'modifyGlobalPath': False,
            'report': 'gesp-lab-extension/.local/install-check.json',
        },
        'optionalNumberGarden': {
            'directory': 'application', 'installer': 'install-number-garden.cmd',
            'launcher': '打开数间.cmd', 'url': 'http://127.0.0.1:4173',
            'requiresNode': '22+', 'originalManifest': 'bundle-manifest.number-garden.json',
        },
        'questionBank': {'levels': 8, 'problems': 216},
        'physicsLab': {'directory': 'physics-lab-extension', 'version': '2.1.0', 'lessons': 64, 'webglLabs': 48, 'practiceProjects': 10},
        'verificationFile': 'integration-verification.json',
        'sourceImportFile': 'codearena-import.json',
    }
    (ROOT / 'bundle-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    files = []
    for path in ROOT.iterdir():
        if path.is_file() and path.suffix in {'.cmd', '.bat', '.mjs', '.txt', '.json'} and path.name not in STATE_FILES:
            files.append(path)
    for folder in ['setup', 'setup-tests', 'gesp-lab-extension', 'physics-lab-extension', 'application', 'node', 'python', 'devcpp']:
        for path in (ROOT / folder).rglob('*'):
            if not path.is_file():
                continue
            relative = path.relative_to(ROOT)
            if set(relative.parts) & EXCLUDED_PARTS or path.name in EXCLUDED_FILES:
                continue
            if relative.as_posix() == 'gesp-lab-extension/native-host/dist/config.json':
                continue
            if relative.parts[:2] == ('physics-lab-extension', 'dist'):
                continue
            if path.suffix in {'.pyc', '.log'}:
                continue
            files.append(path)
    hashes = []
    for path in sorted(files):
        with path.open('rb') as stream:
            hashes.append((path.relative_to(ROOT).as_posix(), hashlib.file_digest(stream, 'sha256').hexdigest()))
    (ROOT / 'SHA256SUMS.txt').write_text(''.join(f'{digest}  {name}\n' for name, digest in hashes), encoding='utf-8')
    # Re-read the completed list and verify the actual bytes, including EXEs and the wheel.
    for name, expected in hashes:
        with (ROOT / name).open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected, name
    print(json.dumps({'distributionFiles': len(hashes), 'bytes': sum(path.stat().st_size for path in files), 'checksumsVerified': True}))


if __name__ == '__main__':
    main()
