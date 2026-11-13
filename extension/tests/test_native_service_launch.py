"""Exercise the source host and PowerShell launcher without touching the real service."""
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SourceServiceLaunchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / '.tmp', prefix='native launch ')
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'manifest.json').write_text('{}')
        shutil.copy2(ROOT / 'scripts/launch-learning.ps1', self.root / 'scripts/launch-learning.ps1')
        self.host = self.root / 'host.py'
        for name in ('host.py','judge.py','debugger.py','gdb_support.py'):
            shutil.copy2(ROOT / 'native-host' / name, self.root / name)
        (self.root / 'config.json').write_text(json.dumps({'extensionRoot': str(self.root)}))

    def tearDown(self):
        child_file = self.root / 'child-pid.txt'
        if child_file.exists():
            child_pid = int(child_file.read_text())
            subprocess.run(['powershell.exe', '-NoProfile', '-Command',
                            f'$p=Get-Process -Id {child_pid} -ErrorAction SilentlyContinue; if($p){{$p.Kill();$p.WaitForExit()}}'],
                           capture_output=True, timeout=10)
        self.temp.cleanup()

    def message(self, request):
        payload = json.dumps(request).encode()
        result = subprocess.run([sys.executable,'-E','-s','-u',str(self.host)], input=struct.pack('<I', len(payload)) + payload,
                                capture_output=True, timeout=20, cwd=self.root)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        self.assertGreaterEqual(len(result.stdout), 4)
        self.assertEqual(struct.unpack('<I', result.stdout[:4])[0], len(result.stdout) - 4)
        return json.loads(result.stdout[4:])

    def launch(self, source):
        (self.root / 'start-learning.ps1').write_text(source, encoding='utf-8')
        capability = self.message({'mode': 'capabilities'})
        self.assertIn('learningServiceControl', capability['capabilities'])
        job = self.message({'mode': 'learning_service_start', 'restart': True})
        self.assertRegex(job['id'], '^[a-f0-9]{32}$')
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            status = self.message({'mode': 'learning_service_status', 'jobId': job['id']})
            if status['status'] in ('completed', 'failed'):
                return status
            time.sleep(.2)
        self.fail('Source native launcher did not finish')

    def test_source_host_starts_powershell_after_native_message_process_exits(self):
        status = self.launch("""param([switch]$Restart)
Start-Sleep -Milliseconds 200
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'launched.txt'),[string]$Restart.IsPresent)
Write-Host 'Ready'
exit 0
""")
        self.assertEqual(status['status'], 'completed', status)
        self.assertEqual((self.root / 'launched.txt').read_text(), 'True')

    def test_failure_is_reported_back_through_native_messages(self):
        status = self.launch("""param([switch]$Restart)
[IO.File]::WriteAllText((Join-Path $PSScriptRoot '.local/restart-error.log'),'fixture startup failure')
exit 7
""")
        self.assertEqual(status['status'], 'failed', status)
        self.assertIn('fixture startup failure', status['message'])

    def test_ready_does_not_wait_for_long_lived_backend_descendant(self):
        started = time.monotonic()
        status = self.launch("""param([switch]$Restart)
$child=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -ArgumentList '-NoProfile -Command Start-Sleep -Seconds 40' -WindowStyle Hidden -PassThru
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'child-pid.txt'),[string]$child.Id)
Write-Host 'Ready'
exit 0
""")
        self.assertEqual(status['status'], 'completed', status)
        self.assertLess(time.monotonic() - started, 15, 'Ready must not wait for the backend to exit')


if __name__ == '__main__':
    unittest.main()
