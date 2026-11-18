"""Windows sharing violations must not replace C++ verdicts or native JSON."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('judge_cleanup_test', ROOT/'native-host/judge.py')
judge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(judge)


def locked():
    error = PermissionError(13, '另一个程序正在使用此文件', 'program.exe')
    error.winerror = 32
    return error


class CleanupTests(unittest.TestCase):
    def test_temporary_lock_retries_only_the_current_folder(self):
        with patch.object(judge.shutil, 'rmtree', side_effect=[locked(), locked(), None]) as remove, patch.object(judge.time, 'sleep'):
            self.assertTrue(judge.cleanup_workspace('request-folder'))
        self.assertEqual(remove.call_count, 3)
        self.assertTrue(all(call.args == ('request-folder',) for call in remove.call_args_list))

    def test_persistent_lock_preserves_result_and_logs_only_to_stderr(self):
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(judge.shutil, 'rmtree', side_effect=locked()) as remove, patch.object(judge.time, 'sleep'), contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            self.assertFalse(judge.cleanup_workspace('request-folder'))
        self.assertEqual(remove.call_count, 6)
        self.assertEqual(output.getvalue(), '')
        self.assertIn('request-folder', errors.getvalue())

    def test_cleanup_does_not_mask_original_execution_error(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(judge.tempfile, 'mkdtemp', return_value=folder), patch.object(judge.shutil, 'rmtree', side_effect=locked()), patch.object(judge.time, 'sleep'), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaisesRegex(ValueError, 'original error'):
                    with judge.judge_workspace():
                        raise ValueError('original error')

    def test_windows_taskkill_failure_still_kills_and_waits_for_program(self):
        process = Mock(pid=1234)
        process.__enter__ = Mock(return_value=process)
        process.__exit__ = Mock(return_value=False)
        process.communicate.side_effect = [subprocess.TimeoutExpired('program', 2), (b'partial', b'')]
        process.poll.return_value = None
        with patch.object(judge, 'IS_WINDOWS', True), patch.object(judge.subprocess, 'CREATE_NEW_PROCESS_GROUP', 512, create=True), patch.object(judge.subprocess, 'Popen', return_value=process), patch.object(judge.subprocess, 'run', side_effect=OSError('taskkill unavailable')):
            result = judge.execute(['program.exe'])
        self.assertTrue(result['timeout'])
        self.assertEqual(result['out'], 'partial')
        process.kill.assert_called_once()
        self.assertEqual(process.communicate.call_count, 2)
        process.__exit__.assert_called_once()

    @unittest.skipUnless(os.name == 'nt', 'Actual Windows file-sharing semantics')
    def test_real_open_file_does_not_escape_cleanup(self):
        with tempfile.TemporaryDirectory() as parent:
            folder = Path(parent)/'request'; folder.mkdir()
            binary = folder/'program.exe'; binary.write_bytes(b'fixture')
            with binary.open('rb'), patch.object(judge.time, 'sleep'), contextlib.redirect_stderr(io.StringIO()):
                self.assertFalse(judge.cleanup_workspace(folder))
            self.assertTrue(judge.cleanup_workspace(folder))


@unittest.skipUnless(judge.compiler_path(), 'C++ compiler required')
class NativeExecutionTests(unittest.TestCase):
    def test_verdicts_survive_windows_cleanup_failure(self):
        with tempfile.TemporaryDirectory() as parent:
            with patch.object(judge.tempfile, 'tempdir', parent), patch.object(judge.shutil, 'rmtree', side_effect=locked()), patch.object(judge.time, 'sleep'), contextlib.redirect_stderr(io.StringIO()):
                for source, status in [('int main(){return 7;}', 'RE'), ('not valid C++', 'CE'), ('int main(){while(true){}}', 'TLE')]:
                    with self.subTest(status=status):
                        self.assertEqual(judge.judge({'code': source})['status'], status)
                result = judge.judge({'code': '#include <iostream>\nint main(){std::cout<<42;}', 'mode': 'judge', 'cases': [{'input': '', 'expected': '42', 'score': 100}]})
                self.assertEqual(result['status'], 'AC')
                self.assertEqual(result['score'], 100)

    def test_native_message_stays_valid_when_executable_cleanup_is_locked(self):
        # Exercise the real host framing and real compiler in an isolated process.
        wrapper = f"""
import sys
sys.path.insert(0, {str(ROOT/'native-host')!r})
import judge, host
def locked(path):
    raise PermissionError(13, 'WinError 32 simulated lock', str(path))
judge.shutil.rmtree=locked
judge.time.sleep=lambda delay: None
host.install_config=lambda: {{}}
host.main()
"""
        payload = json.dumps({'mode': 'run', 'code': '#include <iostream>\nint main(){std::cout<<42;}'}).encode()
        with tempfile.TemporaryDirectory() as parent:
            result = subprocess.run([sys.executable, '-c', wrapper], input=struct.pack('<I', len(payload))+payload,
                                    capture_output=True, timeout=30, env={**os.environ, 'TMPDIR': parent, 'TMP': parent, 'TEMP': parent})
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        length, = struct.unpack('<I', result.stdout[:4])
        self.assertEqual(length, len(result.stdout)-4)
        response = json.loads(result.stdout[4:])
        self.assertEqual(response['status'], 'OK')
        self.assertEqual(response['output'], '42')
        self.assertIn(b'WinError 32', result.stderr)


if __name__ == '__main__':
    unittest.main()
