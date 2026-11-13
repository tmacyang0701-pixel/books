"""Check the native launcher, framing, compiler and runtime together."""
import argparse
import json
import os
import struct
import subprocess
from pathlib import Path


def exchange(host, request):
    payload=json.dumps(request).encode()
    command=[os.environ.get('COMSPEC','cmd.exe'),'/d','/c',str(host)] if host.suffix.lower() in ('.bat','.cmd') else [str(host)]
    result=subprocess.run(command,input=struct.pack('<I',len(payload))+payload,
                          capture_output=True,timeout=45,cwd=host.parent)
    if result.returncode or len(result.stdout)<4:
        raise ValueError('the native host did not return a message: '+result.stderr.decode('utf-8','replace')[:500])
    length=struct.unpack('<I',result.stdout[:4])[0]
    if length>900000 or length!=len(result.stdout)-4:
        raise ValueError('invalid native messaging response length')
    return json.loads(result.stdout[4:])


def check(host):
    try:
        capability=exchange(host,{'mode':'capabilities'})
        if 'learningServiceControl' not in capability.get('capabilities',[]):
            raise ValueError('the native host is outdated and does not support page startup')
        if 'cppDebugger' not in capability.get('capabilities',[]) or not capability.get('debuggerAvailable'):
            raise ValueError('the native host or GDB debugger is missing/outdated')
        answer=exchange(host,{'mode':'run','code':'#include <iostream>\nint main(){std::cout << 42;}','input':''})
        if answer.get('status')!='OK' or str(answer.get('output','')).strip()!='42':
            raise ValueError('the C++ compile/run probe did not produce 42')
        debug=exchange(host,{'mode':'debug_start','code':'int main(){\n int number=42;\n return number;\n}\n','input':''})
        if debug.get('status')!='paused' or not debug.get('frame',{}).get('isUser'):
            raise ValueError('the GDB/Python debug probe failed: '+str(debug.get('error','no paused frame'))[:500])
    except (OSError,subprocess.TimeoutExpired,ValueError) as exc:
        print(f'Native host check FAILED: {exc}. Check Python, runtime libraries and GCC configuration.')
        return 1
    print('Native host check OK: source launcher + C++17 compile/run + GDB/Python + messaging protocol + startup capability.')
    return 0


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host',required=True,type=Path)
    raise SystemExit(check(parser.parse_args().host.resolve()))
