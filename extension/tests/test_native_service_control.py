import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'native-host'))
spec=importlib.util.spec_from_file_location('codearena_control_host',ROOT/'native-host/host.py')
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)


class NativeServiceControlTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'.tmp',prefix='native-control-')
        self.root=Path(self.temp.name);(self.root/'scripts').mkdir()
        (self.root/'manifest.json').write_text('{}');(self.root/'scripts/launch-learning.ps1').write_text('# fixture')
        self.config={'extensionRoot':str(self.root)}

    def tearDown(self):self.temp.cleanup()

    def test_capability_probe_does_not_launch_anything(self):
        with patch.object(host.subprocess,'Popen') as launch:
            self.assertIn('learningServiceControl',host.dispatch({'mode':'capabilities'},{} )['capabilities']);launch.assert_not_called()

    def test_only_fixed_launcher_is_spawned_and_status_is_readable(self):
        with patch.object(host.subprocess,'Popen') as launch:
            job=host.dispatch({'mode':'learning_service_start','restart':True,'command':'ignore-me','path':'C:/untrusted.ps1'},self.config)
            arguments=launch.call_args.args[0]
            self.assertIn(str(self.root/'scripts/launch-learning.ps1'),arguments)
            self.assertNotIn('ignore-me',arguments);self.assertNotIn('C:/untrusted.ps1',arguments)
            self.assertEqual(arguments[-1],'-Restart');self.assertEqual(launch.call_args.kwargs['cwd'],self.root)
        saved=host.dispatch({'mode':'learning_service_status','jobId':job['id']},self.config)
        self.assertEqual(saved['status'],'queued')

    def test_invalid_status_path_and_restart_type_are_rejected(self):
        for request in ({'mode':'learning_service_status','jobId':'../../config'},{'mode':'learning_service_start','restart':'true'}):
            with self.assertRaises(ValueError):host.dispatch(request,self.config)

    def test_launch_failure_is_recorded_as_failure(self):
        with patch.object(host.subprocess,'Popen',side_effect=PermissionError('denied')):
            job=host.dispatch({'mode':'learning_service_start'},self.config)
        self.assertEqual(job['status'],'failed')
        self.assertEqual(json.loads((self.root/'.local/service-start'/f"{job['id']}.json").read_text(encoding='utf-8'))['status'],'failed')

if __name__=='__main__':unittest.main()
