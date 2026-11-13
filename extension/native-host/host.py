"""Chrome Native Messaging host: stdin/stdout are reserved for framed JSON."""
import json
import os
import struct
import sys
import re
import subprocess
import uuid
import time
from pathlib import Path

from judge import judge
from debugger import Debugger,debugger_path


def install_config():
    base = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
    config = base / "config.json"
    if not config.exists() and not getattr(sys, "frozen", False):
        config = base / "dist" / "config.json"
    if config.exists():
        data = json.loads(config.read_text(encoding="utf-8-sig"))
        if data.get("compiler"):
            os.environ["CXX"] = data["compiler"]
        return data
    return {}


def learning_root(config):
    base=Path(sys.executable if getattr(sys,'frozen',False) else __file__).resolve().parent
    candidates=[Path(config['extensionRoot'])] if config.get('extensionRoot') else [base.parent.parent/'extension',base.parent/'extension',base.parent.parent,base.parent]
    for root in candidates:
        if (root/'manifest.json').is_file() and (root/'scripts/launch-learning.ps1').is_file():return root.resolve()
    raise ValueError('未找到学习服务目录，请运行 install-all.bat 更新本地组件。')


def learning_endpoint(config):
    try:
        root=learning_root(config)
        path=root/'.local/service-endpoint.json'
        if path.is_file():
            endpoint=json.loads(path.read_text(encoding='utf-8-sig'))
            port=endpoint.get('port')
            if type(port) is int and 1024<=port<=65535 and Path(endpoint.get('instancePath','')).resolve()==root:
                return f'http://127.0.0.1:{port}'
    except (OSError,ValueError,TypeError):
        pass
    return 'http://127.0.0.1:8766'


def dispatch(request,config,debugger=None):
    if not isinstance(request,dict):raise ValueError('消息必须为 JSON 对象。')
    mode=request.get('mode')
    if mode=='capabilities':return dict(nativeVersion=3,capabilities=['judge','learningServiceControl','cppDebugger','serviceEndpoint'],debuggerAvailable=bool(debugger_path()),serviceUrl=learning_endpoint(config))
    if isinstance(mode,str) and mode.startswith('debug_'):
        if debugger is None:raise ValueError('调试需要保持本地连接，请使用页面调试入口')
        return debugger.handle(request)
    if mode in ('learning_service_start','learning_service_status'):
        root=learning_root(config)
        jobs=root/'.local/service-start'
        if mode=='learning_service_status':
            ident=request.get('jobId','')
            if not isinstance(ident,str) or not re.fullmatch('[a-f0-9]{32}',ident):raise ValueError('启动任务编号无效。')
            path=jobs/(ident+'.json')
            if not path.is_file():raise ValueError('启动任务不存在，请重新点击启动。')
            return json.loads(path.read_text(encoding='utf-8-sig'))
        if type(request.get('restart',False)) is not bool:raise ValueError('restart 必须为布尔值。')
        ident=uuid.uuid4().hex;jobs.mkdir(parents=True,exist_ok=True)
        job=dict(id=ident,status='queued',message='正在启动本地学习服务…',createdAt=time.time())
        path=jobs/(ident+'.json');path.write_text(json.dumps(job,ensure_ascii=False),encoding='utf-8')
        powershell=Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe'
        command=[str(powershell),'-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'scripts/launch-learning.ps1'),'-JobId',ident]
        if request.get('restart'):command.append('-Restart')
        try:
            subprocess.Popen(command,cwd=root,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                             creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
        except OSError:
            job.update(status='failed',message='无法启动本地服务，请检查文件权限或重新运行安装器。')
            path.write_text(json.dumps(job,ensure_ascii=False),encoding='utf-8')
        return job
    return judge(request)


def read_exact(n):
    chunks = []
    while n:
        part = sys.stdin.buffer.read(n)
        if not part:
            return None
        chunks.append(part)
        n -= len(part)
    return b"".join(chunks)


def respond(value):
    payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
    # Native host -> Chrome must not exceed 1 MiB.
    if len(payload) > 900_000:
        payload = b'{"error":"Result too large"}'
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def main():
    if os.name == 'nt':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    config=install_config()
    debugger=Debugger()
    try:message_loop(config,debugger)
    finally:debugger.close()


def message_loop(config,debugger):
    while True:
        prefix = read_exact(4)
        if prefix is None:
            return
        size = struct.unpack("<I", prefix)[0]
        if size < 2 or size > 220_000:
            respond({"error": "Request size exceeds the supported limit"})
            return
        message = read_exact(size)
        if message is None:
            return
        try:
            request = json.loads(message)
            respond(dispatch(request,config,debugger))
        except Exception as exc:
            respond({"error": str(exc)})


if __name__ == "__main__":
    main()
