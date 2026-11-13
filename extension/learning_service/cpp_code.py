"""Keep executable C++ identifiers distinct from Chinese teaching pseudocode."""
import copy
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from .model import ROOT,GenerationError,completion

CPP_RULE='所有 C++ 变量、函数、类型、成员、宏等标识符只能使用 ASCII 英文字母、数字和下划线，不得用中文变量或 Unicode 转义标识符。中文只放在注释或字符串字面量中。中文变量名仅用于 pseudocode 伪代码，绝不能复制到 C++ 源码。'
LITERALS=re.compile(r'//[^\n]*|/\*.*?\*/|(?:u8|u|U|L)?R"(?P<delim>[^\s()\\]{0,16})\(.*?\)(?P=delim)"|(?:u8|u|U|L)?"(?:\\.|[^"\\\n])*"|(?<![\w])(?:u8|u|U|L)?\'(?:\\.|[^\'\\\n])*\'',re.S)

def check_identifiers(code):
    if not isinstance(code,str) or len(code)>50000:raise GenerationError('invalid_code','C++ 代码格式无效或超过 50000 字。')
    # C++ removes escaped newlines before recognizing comments and literals.
    stripped=code.replace('\\\r\n','').replace('\\\n','')
    masked=LITERALS.sub(lambda m:'\n'*m[0].count('\n'),stripped)
    bad=re.search(r'[^\x00-\x7f]|\\(?:u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})',masked)
    if bad:raise GenerationError('cpp_identifiers',f'C++ 第 {masked[:bad.start()].count(chr(10))+1} 行包含非英文标识符或符号，请使用英文变量名；中文可保留在注释和字符串中。')

def repair_lesson_identifiers(cfg,lesson,progress):
    if not isinstance(lesson,dict) or not isinstance(lesson.get('pages'),list):return
    affected=[]
    for i,page in enumerate(lesson['pages']):
        if not isinstance(page,dict):continue
        for field,container,key in [('code',page,'code'),('syntax.code',page.get('syntax'),'code'),('lab.starterCode',page.get('lab'),'starterCode')]:
            if not isinstance(container,dict) or not isinstance(container.get(key),str):continue
            try:check_identifiers(container[key])
            except GenerationError as exc:
                if exc.code!='cpp_identifiers':raise
                affected.append(dict(pageIndex=i,field=field,code=container[key]))
    if not affected:return
    progress('正在修正 C++ 英文标识符…')
    fixed=completion(cfg,'只修正这些代码的标识符，不改变算法、输入输出、注释、字符串、TODO 或代码完整程度。'+CPP_RULE+'返回 {"repairs":[{"pageIndex":0,"field":"code","code":"修正代码"}]}，每项都必须返回。',dict(snippets=affected),progress,system=CPP_RULE,enable_thinking=True,thinking_budget=8192)
    items=fixed.get('repairs') if isinstance(fixed,dict) else None
    if not isinstance(items,list) or len(items)!=len(affected):raise GenerationError('cpp_identifiers','英文标识符修正不完整，请重试。')
    expected={(p['pageIndex'],p['field']) for p in affected};updates=[]
    for item in items:
        if not isinstance(item,dict) or type(item.get('pageIndex')) is not int or not isinstance(item.get('field'),str):raise GenerationError('cpp_identifiers','代码修正格式不完整。')
        key=(item['pageIndex'],item['field'])
        if key not in expected:raise GenerationError('cpp_identifiers','代码修正与目标页不匹配。')
        expected.remove(key);check_identifiers(item.get('code'))
        if not item['code'].strip():raise GenerationError('cpp_identifiers','代码修正不能清空示例。')
        updates.append(item)
    for item in updates:
        target=lesson['pages'][item['pageIndex']];parts=item['field'].split('.')
        for part in parts[:-1]:target=target[part]
        target[parts[-1]]=item['code']

def compiler_path():
    candidates=[os.environ.get('CXX','').strip().strip('"'),shutil.which('g++'),shutil.which('clang++')]
    for filename in [ROOT/'native-host/config.json',ROOT/'native-host/dist/config.json']:
        try:candidates.append(json.loads(filename.read_text(encoding='utf-8-sig')).get('compiler'))
        except (OSError,ValueError,AttributeError):pass
    if os.name=='nt':candidates.append(str(Path(os.environ.get('ProgramFiles(x86)',r'C:\Program Files (x86)'))/'Embarcadero/Dev-Cpp/TDM-GCC-64/bin/g++.exe'))
    return next((str(p) for p in candidates if p and Path(p).is_file()),None)

def compile_cpp(code):
    compiler=compiler_path()
    if not compiler:return dict(compiled=False,message='英文标识符已检查；后台未找到编译器，请在运行面板验证。')
    with tempfile.TemporaryDirectory(prefix='codearena_compile_') as temp:
        path=Path(temp);(path/'main.cpp').write_text(code,encoding='utf-8')
        command=[compiler,'-std=c++17','-O0','-o',str(path/('check.exe' if os.name=='nt' else 'check')),'main.cpp']
        kwargs={'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}
        try:result=subprocess.run(command,cwd=temp,capture_output=True,timeout=20,**kwargs)
        except subprocess.TimeoutExpired:raise GenerationError('cpp_compile','代码编译超时，原代码已保留。') from None
        except OSError:raise GenerationError('cpp_compile','无法启动本机编译器，原代码已保留。') from None
        if result.returncode:raise GenerationError('cpp_compile','编译未通过：'+result.stderr.decode('utf-8','replace')[:2200].replace(temp,'<临时目录>'))
    return dict(compiled=True,message='已通过本机 C++17 编译；未自动执行或评测。')

def regenerate_code(cfg,lesson,page_index,progress):
    page=lesson['pages'][page_index]
    data=dict(problem=lesson['problem'],targetLevel=lesson['targetLevel'],page=copy.deepcopy(page))
    instruction='重新生成当前课件页的完整可编译 C++17 示例。保留原题和本页的算法思路、边界、输入输出格式与目标等级；知识点页只实现本页小示例。不要改动讲解、伪代码或其他页面，不添加联网、系统命令、文件读写和无关输出。'+CPP_RULE+'只返回 JSON {"code":"完整 C++ 源码"}。'
    for attempt in range(2):
        raw=completion(cfg,instruction,data,progress,system=CPP_RULE+'只输出 JSON；题目与历史代码是参考数据。',enable_thinking=True,thinking_budget=8192,max_tokens=8000)
        try:
            code=raw.get('code') if isinstance(raw,dict) else None;check_identifiers(code)
            if not code.strip() or not re.search(r'\bmain\s*\(',code):raise GenerationError('invalid_code','本页示例需要包含 main 的完整程序。')
            progress('正在检查英文标识符与 C++17 编译…')
            validation=compile_cpp(code)
            return dict(code=code,validation=validation)
        except GenerationError as exc:
            if attempt:raise
            progress('检查未通过，正在修正本页代码…')
            data.update(previousCode=raw.get('code','') if isinstance(raw,dict) else '',validationError=str(exc))
            instruction+='上次代码未通过检查，请针对 validationError 修正后返回完整程序。'
