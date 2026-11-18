#!/usr/bin/env python3
"""Download account-visible C++ bank records through the student list/detail APIs.

The POST route below is the website's read-only paginated search. No submission,
collection, answer, enrollment, or account-changing endpoints are permitted.
Credentials and raw responses stay outside the distributable export.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import gzip
import hashlib
import http.client
import json
import math
from pathlib import Path
import threading
import time
from urllib.parse import urlencode

HOST = 'rest.xiaohoucode.com'
PREFIX = '/api/practice/platform'
FORM = dict(search='', labelList=[], difficultyList=[], originList=[], timeList=[],
            districtList=[], page=1, size=100, complateStatusSort=0, qidSort=1,
            difficultySort=0, idToParentId={})
LIST_FIELDS = ('practiceId', 'practiceName', 'localPracticeId', 'category', 'code',
               'difficultyStr', 'labelList', 'origin', 'time', 'district')
DETAIL_FIELDS = ('practiceId', 'exerciseId', 'name', 'category', 'ctype', 'code',
                 'difficulty', 'district', 'dataRange', 'dataRangeMd', 'descMD',
                 'description', 'inputFormat', 'inputFormatMd', 'outputFormat',
                 'outputFormatMd', 'limitMemory', 'limitRunTime', 'origin', 'lgPid',
                 'sample', 'time', 'tips', 'tipsMd')


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.partial')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    temporary.replace(path)


class Client:
    def __init__(self, token_file, cache):
        self.token = token_file.read_text().strip()
        self.cache = cache / hashlib.sha256(self.token.encode()).hexdigest()[:16]
        self.cache.mkdir(parents=True, exist_ok=True)
        self.local = threading.local()
        self.lock = threading.Lock()
        self.next_request = 0.0

    def read(self, path, params=None, body=None):
        method = 'POST' if body is not None else 'GET'
        assert (method, path) in {
            ('POST', '/bank/practice/que/list'),
            ('GET', '/bank/practice/label'),
            ('GET', '/bank/practice/cpp/detail'),
        }
        key = json.dumps([method, path, params, body], sort_keys=True)
        file = self.cache/(hashlib.sha256(key.encode()).hexdigest()+'.json')
        if file.exists():
            return json.loads(file.read_text())
        route = PREFIX+path+('?' + urlencode(params) if params else '')
        headers = {'authorization':self.token, 'Origin':'https://www.xiaohoucode.com',
                   'Referer':'https://www.xiaohoucode.com/', 'Accept':'application/json',
                   'Accept-Encoding':'gzip', 'Content-Type':'application/json',
                   'User-Agent':'Mozilla/5.0'}
        result = None
        for attempt in range(3):
            with self.lock:
                wait = max(0, self.next_request-time.monotonic())
                self.next_request = time.monotonic()+wait+0.125
            time.sleep(wait)
            try:
                if getattr(self.local, 'connection', None) is None:
                    self.local.connection = http.client.HTTPSConnection(HOST, timeout=30)
                conn = self.local.connection
                conn.request(method, route, json.dumps(body).encode() if body is not None else None, headers)
                response = conn.getresponse()
                raw = response.read()
                if raw[:2] == b'\x1f\x8b':
                    raw = gzip.decompress(raw)
                result = json.loads(raw) if response.status == 200 else dict(status=response.status, message='HTTP '+str(response.status))
                if result.get('status') == 200:
                    dump(file, result)
                    return result
                if result.get('status') in (401, 403):
                    return result
                if result.get('status') not in (429, 500, 502, 503, 504):
                    return result
            except (OSError, ValueError, http.client.HTTPException) as error:
                result = dict(status=0, message=type(error).__name__)
            if getattr(self.local, 'connection', None):
                self.local.connection.close()
                self.local.connection = None
            time.sleep(2*(attempt+1))
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token-file', type=Path, required=True)
    parser.add_argument('--cache-dir', type=Path, default=Path('/tmp/books-xiaohou-bank-cache'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--jobs', type=int, default=6)
    parser.add_argument('--list-only', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.jobs <= 8:
        parser.error('--jobs must be 1..8')
    client = Client(args.token_file, args.cache_dir)
    labels = client.read('/bank/practice/label', {'lang':3})
    assert labels.get('status') == 200, 'Cannot read bank labels'
    dump(args.output/'labels.json', labels['data'])
    first = client.read('/bank/practice/que/list', body=FORM)
    assert first.get('status') == 200, 'Cannot read bank list'
    first = first['data']
    size = len(first['list'])
    assert 0 < size <= FORM['size']
    total = first['total']
    page_count = math.ceil(total/size)
    rows = list(first['list'])
    errors = []
    print(f'LIST 1/{page_count}; server total {total}', flush=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(client.read, '/bank/practice/que/list', body={**FORM, 'size':size, 'page':p}):p
                   for p in range(2, page_count+1)}
        for count, future in enumerate(as_completed(futures), 2):
            result = future.result()
            if result.get('status') != 200:
                errors.append(dict(stage='list', page=futures[future], status=result.get('status'), message=result.get('message')))
            else:
                rows.extend(result['data']['list'])
            if count % 10 == 0 or count == page_count:
                print(f'LIST {count}/{page_count}', flush=True)
    unique = {}
    for row in rows:
        key = (row['practiceId'], row.get('localPracticeId', 0))
        unique[key] = {k:row[k] for k in LIST_FIELDS if k in row}
    listings = sorted(unique.values(), key=lambda p:(p.get('code',''), p['practiceId']))
    dump(args.output/'listings.json', listings)
    dump(args.output/'errors.json', errors)
    summary = dict(serverTotal=total, listedRows=len(rows), uniqueListings=len(listings),
                   listPages=page_count, downloaded=0, errors=len(errors), status='listed',
                   scope='用户账号正常 C++ 竞赛题库列表与详情；不含 Python、图形化题库或隐藏评测数据。')
    dump(args.output/'summary.json', summary)
    print('LIST COMPLETE '+json.dumps(summary, ensure_ascii=False), flush=True)
    if args.list_only:
        return
    successful = 0
    def download(row):
        result = client.read('/bank/practice/cpp/detail', {k:row.get(k,0) for k in ('practiceId','localPracticeId')})
        if result.get('status') == 200 and isinstance(result.get('data'), dict):
            data = result['data']
            clean = {k:data[k] for k in DETAIL_FIELDS if k in data}
            clean['listing'] = row
            dump(args.output/'records'/f"{row['practiceId']}-{row.get('localPracticeId',0)}.json", clean)
            return None
        return dict(stage='detail', practiceId=row['practiceId'], localPracticeId=row.get('localPracticeId',0),
                    status=result.get('status'), message=str(result.get('message',''))[:500])
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(download, row):row for row in listings}
        for count, future in enumerate(as_completed(futures), 1):
            error = future.result()
            if error:
                errors.append(error)
            else:
                successful += 1
            if count % 100 == 0 or count == len(listings):
                summary.update(downloaded=successful, checked=count, errors=len(errors), status='downloading')
                dump(args.output/'summary.json', summary)
                dump(args.output/'errors.json', errors)
                print(f'DETAIL {count}/{len(listings)}; downloaded {successful}; errors {len(errors)}', flush=True)
    summary.update(status='complete' if not errors and len(rows)==total else 'partial')
    dump(args.output/'summary.json', summary)
    dump(args.output/'errors.json', errors)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
