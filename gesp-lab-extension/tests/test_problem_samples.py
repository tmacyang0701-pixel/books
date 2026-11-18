import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from learning_service.server import normalize_problem
from learning_service.model import GenerationError


class ProblemSamplesTests(unittest.TestCase):
    def test_course_samples_survive_backend_normalization(self):
        for path in (ROOT/'data/gesp/level-5').glob('xiaohou-*.json'):
            source = json.loads(path.read_text(encoding='utf-8'))
            value = normalize_problem(source)
            self.assertEqual(value['samples'], source['samples'])
            self.assertEqual(len(value['cases']), 20)

    def test_samples_only_gets_default_case_without_trimming(self):
        value = normalize_problem(dict(title='x',description='x',samples=[dict(input='  A\n',output='0\n')]))
        self.assertEqual(value['sampleInput'], '  A\n')
        self.assertEqual(value['cases'], [dict(input='  A\n',expected='0\n',score=100)])

    def test_malformed_samples_are_rejected(self):
        for samples in [None, {}, [None], [dict(input='a')], [dict(input='a',output='b',explanation=1)]]:
            with self.assertRaises(GenerationError):
                normalize_problem(dict(title='x',description='x',samples=samples))


if __name__ == '__main__':
    unittest.main()
