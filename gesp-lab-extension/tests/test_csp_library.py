import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from learning_service.server import Application, normalize_problem, ThreadingHTTPServer, make_handler
from learning_service.model import GenerationError


class CspLibraryTests(unittest.TestCase):
    def test_coding_problem_metadata_and_all_samples_survive_service(self):
        bank = json.loads((ROOT/'data/csp/index.json').read_text())['problems']
        for row in bank:
            if row['kind'] == 'theory':
                continue
            with self.subTest(problem=row['id']):
                original = json.loads((ROOT/row['file']).read_text())
                result = normalize_problem(original)
                for key in ('id', 'level', 'group', 'levelBasis', 'levelStatus', 'cspDifficulty', 'knowledgePoints', 'tags', 'samples', 'cases'):
                    self.assertEqual(result[key], original[key])
                self.assertEqual(len(result['occurrences']), len(original['occurrences']))
                self.assertEqual(result['source']['organization'], '学而思')
                app = object.__new__(Application)
                app.bank = bank
                recommendations = app.recommend(result)
                self.assertTrue(all(next(r for r in bank if r['id'] == p['id'])['kind'] != 'theory' for p in recommendations))

    def test_csp_metadata_is_bounded_and_validated(self):
        p = dict(title='x',description='x',group='csp-j',level=5)
        for field, value in [('knowledgePoints', ['x']*21), ('knowledgePoints', [None]), ('occurrences', [None]), ('tags', ['x']*201)]:
            with self.subTest(field=field), self.assertRaises(GenerationError):
                normalize_problem({**p, field:value})

    def test_local_web_preview_serves_csp_catalog_problem_and_picture(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Application({'key':'fixture','base':'http://127.0.0.1:1','model':'fixture','visionModel':'fixture','source':'test'}, directory)
            server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(app))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            opener = build_opener(ProxyHandler({}))
            try:
                base = f'http://127.0.0.1:{server.server_port}/'
                with opener.open(base+'data/csp/index.json') as response:
                    bank = json.load(response)['problems']
                self.assertEqual(len(bank), 115)
                with opener.open(base+bank[0]['file']) as response:
                    self.assertEqual(json.load(response)['id'], bank[0]['id'])
                picture = next((ROOT/'data/csp/assets/images').glob('*.png'))
                with opener.open(base+picture.relative_to(ROOT).as_posix()) as response:
                    self.assertEqual(response.read(), picture.read_bytes())
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
                app.pool.shutdown(wait=True)


if __name__ == '__main__':
    unittest.main()
