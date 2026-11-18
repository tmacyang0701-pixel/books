#!/usr/bin/env python3
"""Repair imported prose placeholders without rebuilding classifications or cases."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from export_xiaohou_bank import dump
from import_xiaohou_bank import EXTENSION, clean_placeholder

FIELDS = ('description','input','output','constraints','tips')


def repair(problem):
    changed = []
    for field in FIELDS:
        before = problem.get(field)
        if not isinstance(before, str):
            continue
        after = clean_placeholder(before)
        # Only touch actual placeholders, not unrelated surrounding whitespace.
        if after != before.strip():
            if field=='description' and not after:
                raise ValueError('Missing complete statement: '+problem['id'])
            problem[field] = after
            changed.append(field)
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    catalog = json.loads((EXTENSION/'data/xiaohou-bank/index.json').read_text())
    changes, counts = [], Counter()
    for row in catalog['problems']:
        path = EXTENSION/row['file']
        original = path.read_bytes()
        p = json.loads(original)
        fields = repair(p)
        if fields:
            dump(path, p)
            counts.update(fields)
            changes.append(dict(id=p['id'],file=row['file'],fields=fields,
                                beforeSha256=hashlib.sha256(original).hexdigest(),
                                afterSha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    export_file = args.directory/'problems.json'
    exported = json.loads(export_file.read_text())
    export_changes = sum(bool(repair(p)) for p in exported)
    if export_changes:
        dump(export_file, exported)
    report = dict(projectProblems=len(changes),exportProblems=export_changes,fields=dict(counts),changes=changes)
    dump(args.directory/'placeholder-repair.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='changes'},ensure_ascii=False))


if __name__=='__main__':
    main()
