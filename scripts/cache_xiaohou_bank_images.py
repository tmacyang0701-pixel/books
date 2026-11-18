#!/usr/bin/env python3
"""Cache referenced public images, without forwarding account credentials."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import http.client
import ipaddress
import json
from pathlib import Path
import re
import time
import threading
import urllib.error
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from export_xiaohou_bank import dump
from import_xiaohou_bank import image_urls, statement_fields

LOCAL = threading.local()
RATE_LOCK = threading.Lock()
NEXT_REQUEST = 0.0
REUSABLE_HOSTS = {'cdn.luogu.com.cn', 'tiku-pro-cdn.speiyou.com', 'luogu.oss-cn-hangzhou.aliyuncs.com'}


def read_image(url):
    parsed = urlsplit(url)
    if parsed.scheme=='https' and parsed.hostname in REUSABLE_HOSTS:
        connections = getattr(LOCAL, 'connections', None)
        if connections is None:
            connections = LOCAL.connections = {}
        for attempt in range(2):
            global NEXT_REQUEST
            with RATE_LOCK:
                delay = max(0, NEXT_REQUEST-time.monotonic())
                NEXT_REQUEST = max(NEXT_REQUEST,time.monotonic())+0.2
            time.sleep(delay)
            connection = connections.setdefault(parsed.hostname, http.client.HTTPSConnection(parsed.hostname, timeout=10))
            try:
                path = parsed.path+('?' + parsed.query if parsed.query else '')
                connection.request('GET', path, headers={'User-Agent':'Mozilla/5.0','Accept':'image/*'})
                response = connection.getresponse()
                raw = response.read(16*1024*1024+1)
                if response.status==200:
                    return raw
                if response.status not in (301,302,303,307,308):
                    raise urllib.error.HTTPError(url,response.status,response.reason,response.headers,None)
                break  # Redirects use urllib's normal handling below.
            except urllib.error.HTTPError:
                raise
            except (OSError,http.client.HTTPException):
                connections.pop(parsed.hostname,None)
                connection.close()
                if attempt:
                    raise
    request = Request(url, headers={'User-Agent':'Mozilla/5.0', 'Accept':'image/*'})
    with urlopen(request, timeout=10) as response:
        if not public_url(response.geturl()):
            raise ValueError('Unsupported image redirect')
        return response.read(16*1024*1024+1)


def public_url(url):
    parsed = urlsplit(url)
    host = parsed.hostname or ''
    if parsed.scheme not in ('http','https') or parsed.username or parsed.password or parsed.port not in (None,80,443):
        return False
    if host in ('localhost','localhost.localdomain') or host.endswith(('.local','.internal','.localhost')) or '.' not in host:
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True


def fetch(url, folder):
    if not public_url(url):
        return dict(status='unavailable', reason='Unsupported image URL')
    # Legacy http image hosts often only serve their current https endpoint.
    attempts = [url] if url.startswith('https:') else ['https:'+url[5:],url]
    error = 'Image unavailable'
    for attempt in attempts:
        try:
            raw = read_image(attempt)
            if len(raw)>16*1024*1024:
                raise ValueError('Image exceeds 16 MiB')
            if raw.startswith(b'\x89PNG\r\n\x1a\n'):
                extension='png'
            elif raw.startswith(b'\xff\xd8\xff'):
                extension='jpg'
            elif raw.startswith((b'GIF87a',b'GIF89a')):
                extension='gif'
            elif raw.startswith(b'RIFF') and raw[8:12]==b'WEBP':
                extension='webp'
            else:
                raise ValueError('Response is not a supported raster image')
            name=hashlib.sha256(url.encode()).hexdigest()[:24]+'.'+extension
            (folder/name).write_bytes(raw)
            return dict(status='ok', file=name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        except urllib.error.HTTPError as failure:
            error='HTTP '+str(failure.code)
        except (OSError,ValueError,http.client.HTTPException) as failure:
            error=type(failure).__name__+': '+str(failure)[:160]
    return dict(status='unavailable', reason=error)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('--watch',action='store_true')
    parser.add_argument('--jobs',type=int,default=6,choices=range(1,13))
    parser.add_argument('--retry-transient',action='store_true')
    args=parser.parse_args()
    folder=args.directory/'assets/images'
    folder.mkdir(parents=True,exist_ok=True)
    file=folder/'manifest.json'
    manifest=json.loads(file.read_text()) if file.exists() else {}
    if args.retry_transient:
        manifest={url:result for url,result in manifest.items() if not (
            urlsplit(url).hostname in REUSABLE_HOSTS and result['status']!='ok'
            and not result.get('reason','').startswith(('HTTP 404','HTTP 403','ValueError:')))}
    seen=set()
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        while True:
            urls=set()
            for record in (args.directory/'records').glob('*.json'):
                if record.name in seen:
                    continue
                seen.add(record.name)
                data=json.loads(record.read_text())
                urls.update(image_urls(statement_fields(data)))
            pending=sorted(urls-manifest.keys())
            futures={pool.submit(fetch,url,folder):url for url in pending}
            for count,future in enumerate(as_completed(futures),1):
                manifest[futures[future]]=future.result()
                if count%25==0 or count==len(futures):
                    dump(file,manifest)
                    print(f'IMAGES {len(manifest)} checked; {sum(v["status"]=="ok" for v in manifest.values())} cached',flush=True)
            status=json.loads((args.directory/'summary.json').read_text())['status']
            if not args.watch or (status in ('complete','partial') and not pending):
                break
            time.sleep(10)
    dump(file,manifest)
    print('Image cache finished',len(manifest),flush=True)


if __name__=='__main__':
    main()
