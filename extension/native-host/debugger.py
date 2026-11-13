"""One GDB session per persistent Chrome native connection; fixed read-only inspector."""
import ast
import ctypes
import json
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from judge import compiler_path
from gdb_support import SOURCE


def debugger_path():
    compiler=compiler_path()
    candidate=Path(compiler).parent/'gdb.exe' if compiler else None
    return str(candidate) if candidate and candidate.is_file() else shutil.which('gdb')


class ProcessJob:
    """Closing the native process also kills only this debugger and its children."""
    def __init__(self,process):
        self.handle=None
        if os.name!='nt':return
        from ctypes import wintypes as w
        class Basic(ctypes.Structure):
            _fields_=[('a',ctypes.c_int64),('b',ctypes.c_int64),('flags',w.DWORD),('min',ctypes.c_size_t),('max',ctypes.c_size_t),('count',w.DWORD),('affinity',ctypes.c_size_t),('priority',w.DWORD),('scheduling',w.DWORD)]
        class Limits(ctypes.Structure):
            _fields_=[('basic',Basic),('io',ctypes.c_uint64*6),('process',ctypes.c_size_t),('job',ctypes.c_size_t),('peakProcess',ctypes.c_size_t),('peakJob',ctypes.c_size_t)]
        self.kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes=[ctypes.c_void_p,w.LPCWSTR];self.kernel.CreateJobObjectW.restype=w.HANDLE
        self.kernel.SetInformationJobObject.argtypes=[w.HANDLE,ctypes.c_int,ctypes.c_void_p,w.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE]
        self.kernel.CloseHandle.argtypes=[w.HANDLE]
        handle=self.kernel.CreateJobObjectW(None,None)
        limits=Limits();limits.basic.flags=0x2000
        if not handle or not self.kernel.SetInformationJobObject(handle,9,ctypes.byref(limits),ctypes.sizeof(limits)) or not self.kernel.AssignProcessToJobObject(handle,w.HANDLE(int(process._handle))):
            if handle:self.kernel.CloseHandle(handle)
            raise OSError('无法创建调试进程保护，请检查 Windows 权限')
        self.handle=handle

    def close(self):
        if self.handle:self.kernel.CloseHandle(self.handle);self.handle=None


class DebugSession:
    def __init__(self):
        self.id=uuid.uuid4().hex;self.temp=None;self.process=None;self.job=None;self.token=0;self.events=queue.Queue(maxsize=2000);self.paused=False;self.breakpoints=[];self.frame=0;self.diagnostics=[]

    def close(self):
        if self.job:self.job.close();self.job=None
        if self.process:
            if self.process.poll() is None:self.process.kill()
            try:self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:pass
            for stream in (self.process.stdin,self.process.stdout):
                try:stream.close()
                except (OSError,ValueError):pass
            self.process=None
        if self.temp:
            try:self.temp.cleanup()
            except OSError:pass
            self.temp=None
        self.paused=False

    def _read(self):
        try:
            while self.process:
                line=self.process.stdout.readline(1000000)
                if not line:break
                self.diagnostics=(self.diagnostics+[line.decode('utf-8','replace').strip()])[-15:]
                try:self.events.put(line.decode('utf-8','replace').strip(),timeout=1)
                except queue.Full:break
        except (OSError,ValueError):pass
        try:self.events.put_nowait(None)
        except queue.Full:pass

    def command(self,command,wait_stop=False,timeout=8):
        self.token+=1;token=str(self.token);console=[];stopped=None;done=False
        self.process.stdin.write((token+command+'\n').encode('utf-8'));self.process.stdin.flush()
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            try:line=self.events.get(timeout=max(.01,deadline-time.monotonic()))
            except queue.Empty:break
            if line is None:raise RuntimeError('调试器已退出，请重新启动调试。\n'+'\n'.join(self.diagnostics)[-1800:])
            if line.startswith(('~','&')):
                try:console.append(ast.literal_eval(line[1:]))
                except (ValueError,SyntaxError):pass
            if line.startswith('*stopped'):stopped=line
            if line.startswith(token+'^error'):
                match=re.search(r'msg=("(?:[^"\\]|\\.)*")',line)
                detail=ast.literal_eval(match[1]) if match else line
                raise RuntimeError(str(detail)[:1000])
            if line.startswith((token+'^done',token+'^running',token+'^exit')):done=True
            if done and (not wait_stop or stopped):return ''.join(console),stopped
            if sum(map(len,console))>300000:raise RuntimeError('调试器返回内容过多，已停止')
        raise RuntimeError('调试操作超过 8 秒，已停止程序；请检查死循环或缩小输入')

    def inspect(self,kind,*args):
        expression='python ca_emit(ca_'+kind+''.join(','+repr(value) for value in args)+')'
        output,_=self.command('-interpreter-exec console '+json.dumps(expression))
        match=re.search(r'CODEARENA_JSON:(.*)',output)
        if not match:raise RuntimeError('GDB 未返回变量信息；需要启用 Python 支持的 GDB')
        result=json.loads(match[1])
        if result.get('error'):raise ValueError(result['error'])
        return result

    def output(self):
        result={}
        for name,key in [('stdout.txt','output'),('stderr.txt','stderr')]:
            try:
                with (Path(self.temp.name)/name).open('rb') as handle:result[key]=handle.read(100000).decode('utf-8','replace')
            except OSError:result[key]=''
        return result

    def snapshot(self,frame=0,offset=0):
        self.frame=frame
        return dict(status='paused',sessionId=self.id,breakpoints=self.breakpoints,**self.inspect('snapshot',frame,offset),**self.output())

    def stopped(self,record):
        if record and 'reason="exited' in record:
            result=dict(status='exited',sessionId=self.id,**self.output());self.close();return result
        self.paused=True
        result=self.snapshot()
        if record and 'reason="signal-received"' in record:
            signal=re.search(r'signal-name="([^"]+)"',record)
            result['signal']=signal[1] if signal else 'signal'
        return result

    def set_breakpoints(self,lines):
        if not isinstance(lines,list) or len(lines)>40 or any(type(n)!=int or not 1<=n<=self.line_count for n in lines):raise ValueError('断点必须是代码中的行号，最多 40 个')
        self.command('-break-delete')
        actual=[]
        for line in sorted(set(lines)):
            try:self.command('-break-insert '+json.dumps('main.cpp:'+str(line)));actual.append(line)
            except RuntimeError:pass
        self.breakpoints=actual

    def start(self,request):
        code=request.get('code');text=request.get('input','')
        if not isinstance(code,str) or not code.strip() or len(code)>100000:raise ValueError('调试代码不能为空且不能超过 100KB')
        if not isinstance(text,str) or len(text)>20000:raise ValueError('输入不能超过 20KB')
        if os.name=='nt':ctypes.windll.kernel32.SetErrorMode(0x0001|0x0002)  # Child failures return diagnostics, not OS modal dialogs.
        compiler=compiler_path();gdb=debugger_path()
        if not compiler or not gdb:raise ValueError('未找到 GDB 调试器，请安装包含 GCC 和 GDB 的 Dev-C++，然后重试')
        self.line_count=len(code.splitlines());self.temp=tempfile.TemporaryDirectory(prefix='codearena_debug_');folder=Path(self.temp.name)
        (folder/'main.cpp').write_text(code,encoding='utf-8');(folder/'stdin.txt').write_text(text,encoding='utf-8')
        # Separate translation unit preserves all original source line numbers.
        (folder/'io.cpp').write_text('#include <cstdio>\n__attribute__((constructor)) static void ca_io(){freopen("stdin.txt","r",stdin);freopen("stdout.txt","w",stdout);freopen("stderr.txt","w",stderr);}\n',encoding='ascii')
        env=os.environ.copy();env['PATH']=str(Path(compiler).parent)+os.pathsep+env.get('PATH','')
        flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
        compiled=subprocess.run([compiler,'-std=c++17','-g3','-gdwarf-4','-O0','-fno-omit-frame-pointer','main.cpp','io.cpp','-o','program.exe'],cwd=folder,env=env,capture_output=True,timeout=20,creationflags=flags)
        if compiled.returncode:
            result=dict(status='CE',compile=compiled.stderr[:100000].decode('utf-8','replace'));self.close();return result
        support=''
        printer_roots=list((Path(compiler).parent.parent/'share').glob('gcc-*/python'))
        if printer_roots:
            support='import sys\nsys.path.insert(0,'+repr(str(printer_roots[0]))+')\ntry:\n from libstdcxx.v6.printers import register_libstdcxx_printers\n register_libstdcxx_printers(None)\nexcept Exception: pass\n'
        (folder/'support.py').write_text(support+SOURCE,encoding='utf-8')
        self.process=subprocess.Popen([gdb,'-nx','-q','--interpreter=mi2','program.exe'],cwd=folder,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,creationflags=flags,bufsize=0)
        self.job=ProcessJob(self.process);threading.Thread(target=self._read,daemon=True).start()
        # TDM GDB 8.3 embeds MSVC Python: `source file.py` passes incompatible
        # CRT FILE pointers and can crash. Let Python open its own file instead.
        load_support='python exec(compile(open("support.py",encoding="utf-8").read(),"support.py","exec"))'
        for command in ['-gdb-set pagination off','-gdb-set confirm off','-gdb-set print elements 30','-gdb-set print repeats 5','-interpreter-exec console '+json.dumps(load_support)]:
            self.command(command)
        self.set_breakpoints(request.get('breakpoints',[]))
        self.command('-break-insert -t main')
        _,stop=self.command('-exec-run',wait_stop=True)
        return self.stopped(stop)

    def handle(self,request):
        if request.get('sessionId')!=self.id or not self.process:raise ValueError('调试会话已结束，请重新开始')
        mode=request.get('mode')
        if mode=='debug_stop':self.close();return {'status':'stopped'}
        if not self.paused:raise ValueError('程序尚未暂停')
        if mode=='debug_step':
            action=request.get('action');commands={'next':'-exec-next','step':'-exec-step','finish':'-exec-finish','continue':'-exec-continue'}
            if action not in commands:raise ValueError('未知调试操作')
            self.paused=False;_,stop=self.command(commands[action],wait_stop=True);return self.stopped(stop)
        if mode=='debug_breakpoints':self.set_breakpoints(request.get('lines'));return {'status':'paused','breakpoints':self.breakpoints}
        if mode=='debug_snapshot':
            frame=request.get('frame',self.frame);offset=request.get('offset',0)
            if type(frame)!=int or not 0<=frame<40 or type(offset)!=int or not 0<=offset<=10000:raise ValueError('变量页或栈帧无效')
            return self.snapshot(frame,offset)
        if mode in ('debug_children','debug_memory'):
            ident=request.get('variableId','');offset=request.get('offset',0)
            if not isinstance(ident,str) or not re.fullmatch(r'v\d+(?:\.\d+){0,12}',ident) or type(offset)!=int or not 0<=offset<=10000:raise ValueError('变量编号或分页无效')
            return self.inspect('children',ident,offset) if mode=='debug_children' else self.inspect('memory',ident)
        raise ValueError('未知调试操作')


class Debugger:
    def __init__(self):self.session=None
    def close(self):
        if self.session:self.session.close();self.session=None
    def handle(self,request):
        try:
            if request.get('mode')=='debug_start':
                self.close();self.session=DebugSession();return self.session.start(request)
            if not self.session:raise ValueError('请先启动调试')
            return self.session.handle(request)
        except Exception:
            self.close();raise
