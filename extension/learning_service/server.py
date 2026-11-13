"""Loopback-only courseware API; run with python -m learning_service.server."""
import argparse
import base64
import binascii
import io
import hashlib
import json
import mimetypes
import os
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .model import ROOT, GenerationError, PROBLEM_SHAPE, completion, make_lesson, make_run_case, answer_page, settings
from .knowledge import validate_topic,bank_candidates,make_topic_practice
from .code_analysis import analyze as analyze_code, authorize as authorize_analysis
from .analysis_settings import AnalysisSettings

MAX_BODY=12*1024*1024
MAX_FILE=8*1024*1024


def chat_attachments(message):
    images=message.get('attachments',[])
    if not isinstance(images,list) or len(images)>3 or (images and message['role']!='user'):
        raise GenerationError('invalid_images','仅用户消息可以附带图片，每次最多 3 张。')
    checked=[]
    for image in images:
        if not isinstance(image,dict): raise GenerationError('invalid_images','图片格式无效。')
        url=image.get('dataUrl','')
        if not isinstance(url,str) or len(url)>2800000:
            raise GenerationError('invalid_images','每张图片不能超过 2 MiB。')
        match=re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})',url)
        if not match: raise GenerationError('invalid_images','仅支持 PNG、JPEG、WebP 图片。')
        try: raw=base64.b64decode(match[2],validate=True)
        except (ValueError,binascii.Error): raise GenerationError('invalid_images','图片编码无效。') from None
        valid={'png':raw.startswith(b'\x89PNG\r\n\x1a\n'),'jpeg':raw.startswith(b'\xff\xd8\xff'),'webp':raw[:4]==b'RIFF' and raw[8:12]==b'WEBP'}[match[1]]
        if not valid or not 12<=len(raw)<=2*1024*1024: raise GenerationError('invalid_images','图片内容或大小无效。')
        name=image.get('name','提问图片')
        if not isinstance(name,str) or len(name)>100: raise GenerationError('invalid_images','图片名称无效。')
        checked.append(dict(dataUrl=url,name=name))
    return checked


def normalize_problem(value, level=5):
    if not isinstance(value,dict): raise GenerationError('invalid_problem','题目必须是 JSON 对象。')
    result={}
    aliases={'description':'statement','input':'inputDesc','output':'outputDesc'}
    for key in ('title','description','input','output','constraints','sampleInput','sampleOutput'):
        text=value.get(key,value.get(aliases.get(key,''),''))
        if not isinstance(text,str) or len(text)>40000: raise GenerationError('invalid_problem',f'题目 {key} 字段无效或过长。')
        result[key]=text.strip() if key not in ('sampleInput','sampleOutput') else text
    if not result['title'] or not result['description']: raise GenerationError('invalid_problem','请填写题目标题与完整题干。')
    selected=value.get('level',level)
    if type(selected)!=int or not 1<=selected<=8: raise GenerationError('invalid_level','等级必须为 1～8。')
    result['level']=selected
    tags=value.get('tags',[])
    if not isinstance(tags,list) or len(tags)>20 or any(not isinstance(t,str) or len(t)>100 for t in tags):
        raise GenerationError('invalid_problem','知识点标签格式无效。')
    result['tags']=tags
    cases=value.get('cases',[])
    if not isinstance(cases,list) or len(cases)>30: raise GenerationError('invalid_problem','最多支持 30 个测试点。')
    if not cases and result['sampleInput'] and result['sampleOutput']:
        cases=[dict(input=result['sampleInput'],expected=result['sampleOutput'],score=100)]
    checked=[]
    for case in cases:
        if not isinstance(case,dict) or any(not isinstance(case.get(k),str) or len(case[k])>20000 for k in ('input','expected')):
            raise GenerationError('invalid_problem','测试点必须有文本 input 和 expected。')
        score=case.get('score',0)
        if type(score)!=int or not 0<=score<=100: raise GenerationError('invalid_problem','测试点分值必须为 0～100 的整数。')
        checked.append(dict(input=case['input'],expected=case['expected'],score=score))
    result['cases']=checked
    for key in ('id','kind','session','casesSource','sampleLabel','explanation'):
        if isinstance(value.get(key),str): result[key]=value[key][:5000]
    if isinstance(value.get('hints'),list): result['hints']=[str(v)[:1000] for v in value['hints'][:6]]
    if isinstance(value.get('source'),dict):
        result['source']={k:str(v)[:2000] for k,v in value['source'].items() if k in ('url','pdfUrl','referenceUrl','note','edition','organization')}
    return result


def identifier(value):
    if not isinstance(value,str) or not re.fullmatch(r'[a-f0-9]{32}',value): raise GenerationError('not_found','记录不存在。')
    return value


def problem_key(problem):
    if isinstance(problem.get('id'),str) and problem['id'].strip(): return problem['id'].strip()
    value={k:problem.get(k,'') for k in ('title','description','input','output','constraints','level')}
    return 'custom-'+hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:32]


class Application:
    def __init__(self, config=None, data_dir=None):
        self.config=config or settings()
        self.data=Path(data_dir or os.environ.get('CODEARENA_DATA_DIR',ROOT/'.local'))
        for folder in ('jobs','lessons','practice'): (self.data/folder).mkdir(parents=True,exist_ok=True)
        self.lock=threading.RLock()
        self.analysis_settings=AnalysisSettings(self.data)
        self.pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix='courseware')
        self.jobs={}
        self.levels=json.loads((ROOT/'data/gesp/levels.json').read_text(encoding='utf-8'))['levels']
        self.bank=json.loads((ROOT/'data/gesp/index.json').read_text(encoding='utf-8'))['problems']
        for path in (self.data/'jobs').glob('*.json'):
            try:
                job=json.loads(path.read_text(encoding='utf-8'))
                if job['status'] in ('queued','running'):
                    job.update(status='failed',message='上次运行被中断，请重试。',error={'code':'interrupted','message':'本地服务已重新启动。请重新生成。'})
                    self.save('jobs',job['id'],job)
                self.jobs[job['id']]=job
            except (ValueError,KeyError,OSError): continue
        self.deduplicate_lessons()

    def archive_lesson(self, ident):
        source=self.data/'lessons'/(identifier(ident)+'.json')
        archive=self.data/'lesson-archive'
        archive.mkdir(exist_ok=True)
        target=archive/(ident+'.json')
        if target.exists(): target=archive/(ident+'-'+uuid.uuid4().hex[:8]+'.json')
        source.replace(target)

    def deduplicate_lessons(self):
        with self.lock:
            seen=set()
            for lesson in self.list_records('lessons'):
                key=problem_key(lesson.get('problem',{}))
                if key in seen: self.archive_lesson(lesson['id'])
                else: seen.add(key)

    def publish_lesson(self, ident, lesson):
        with self.lock:
            key=problem_key(lesson['problem'])
            lesson['problemId']=key
            self.save('lessons',ident,lesson)
            for previous in self.list_records('lessons'):
                if previous['id']!=ident and problem_key(previous.get('problem',{}))==key:
                    self.archive_lesson(previous['id'])

    def delete_lesson(self, ident):
        with self.lock:
            lesson=self.read('lessons',ident)
            key=problem_key(lesson.get('problem',{}))
            if any(j.get('kind')=='lesson' and j.get('problemId')==key and j['status'] in ('queued','running') for j in self.jobs.values()):
                raise GenerationError('busy','本题正在生成课件，请完成后再删除。')
            self.archive_lesson(ident)
            return dict(deleted=True,lessonId=ident,problemId=key)

    def save(self, folder, ident, value):
        identifier(ident)
        with self.lock:
            path=self.data/folder/(ident+'.json')
            temporary=path.with_suffix('.tmp')
            temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
            temporary.replace(path)

    def read(self, folder, ident):
        path=self.data/folder/(identifier(ident)+'.json')
        if not path.is_file(): raise GenerationError('not_found','记录不存在。')
        return json.loads(path.read_text(encoding='utf-8'))

    def list_records(self, folder):
        result=[]
        for path in (self.data/folder).glob('*.json'):
            try: result.append(json.loads(path.read_text(encoding='utf-8')))
            except (ValueError,OSError): continue
        return sorted(result,key=lambda v:v.get('createdAt',0),reverse=True)

    def update(self, ident, **changes):
        with self.lock:
            self.jobs[ident].update(changes,updatedAt=time.time())
            if self.jobs[ident]['kind']!='chat': self.save('jobs',ident,self.jobs[ident])

    def enqueue(self, kind, payload):
        with self.lock:
            key=problem_key(payload['problem']) if kind=='lesson' else None
            if key and any(j.get('kind')=='lesson' and j.get('problemId')==key and j['status'] in ('queued','running') for j in self.jobs.values()):
                raise GenerationError('busy','本题已有课件正在生成，请等待完成。')
            for job_id,job in list(self.jobs.items()):
                if job.get('kind')=='chat' and job['status'] in ('completed','failed') and time.time()-job.get('updatedAt',0)>86400:
                    del self.jobs[job_id]
            if sum(j['status'] in ('queued','running') for j in self.jobs.values())>=4:
                raise GenerationError('busy','当前生成任务较多，请稍后重试。')
            ident=uuid.uuid4().hex
            job=dict(id=ident,kind=kind,status='queued',message='任务已排队',createdAt=time.time())
            if key: job['problemId']=key
            self.jobs[ident]=job
            if kind!='chat': self.save('jobs',ident,job)
            self.pool.submit(self.work,ident,kind,payload)
            return dict(job)

    def recommend(self, problem):
        tags=set(problem.get('tags',[]))
        candidates=[p for p in self.bank if p['id']!=problem.get('id') and p['level']==problem.get('level',5)]
        candidates.sort(key=lambda p:(len(tags&set(p['tags'])),p['session']),reverse=True)
        return [{'id':p['id'],'reason':'共同知识点：'+'、'.join(t for t in p['tags'] if t in tags) if tags&set(p['tags']) else '同级拓展练习'} for p in candidates[:3]]

    def work(self, ident, kind, payload):
        try:
            self.update(ident,status='running',message='正在准备…')
            progress=lambda text:self.update(ident,message=text)
            if kind=='lesson':
                p=payload['problem']; level=payload['targetLevel']
                result=make_lesson(self.config,p,level,self.levels[level-1],payload.get('requirements',''),progress)
                result.update(id=ident,problem=p,targetLevel=level,createdAt=time.time(),model=self.config['model'],recommendations=self.recommend(p))
                self.publish_lesson(ident,result)
                answer={'lessonId':ident}
            elif kind=='import':
                answer={'problem':self.import_file(payload,progress)}
            elif kind=='chat':
                lesson=self.read('lessons',payload['lessonId'])
                has_images=any(m.get('attachments') for m in payload['messages'])
                answer=dict(lessonId=lesson['id'],pageIndex=payload['pageIndex'],model=self.config['visionModel'] if has_images else self.config['model'],
                            answer=answer_page(self.config,lesson,payload['pageIndex'],payload['messages'],progress,payload.get('visualContext','')))
            elif kind=='run-case':
                lesson=self.read('lessons',payload['lessonId'])
                answer=dict(lessonId=lesson['id'],pageIndex=payload['pageIndex'],**make_run_case(self.config,lesson,payload['currentInput'],progress))
            elif kind=='code-analysis':
                answer=analyze_code(self.config,payload,progress)
            elif kind=='topic-practice':
                topic=payload['topic'];level=payload['targetLevel']
                problems=make_topic_practice(self.config,topic,level,normalize_problem,progress)
                for i,p in enumerate(problems):
                    p.update(id=f'practice-{ident}-{i+1}',kind='generated',sampleLabel='AI 生成示例',casesSource='AI 生成练习点，尚未独立验证',difficulty=['入门','巩固','边界'][i])
                answer=dict(id=ident,topic=topic,targetLevel=level,createdAt=time.time(),problems=problems)
                self.save('practice',ident,answer)
            elif kind=='practice':
                lesson=dict(id='',problem=payload['problem'],targetLevel=payload['problem']['level'],knowledgePoints=payload['problem']['tags']) if 'problem' in payload else self.read('lessons',payload['lessonId'])
                shape=dict(PROBLEM_SHAPE,cases=[{'input':'与 sampleInput 相同','expected':'与 sampleOutput 相同','score':50},{'input':'不同的边界输入','expected':'该输入的完整输出','score':50}])
                instruction='针对原题生成恰好 3 道原创 C++ 变式练习，依次为巩固、同等、进阶；进阶也不得超出目标等级。每题有完整约束、样例、提示、参考思路及 2～5 个测试点。测试点整数分数总和必须恰好 100（两点各 50，三点为 34、33、33）；独立验算预期输出，样例输入输出须与同一个测试点一致。返回 {"problems": [题目对象]}，题目对象结构：'+json.dumps(shape,ensure_ascii=False)
                raw=completion(self.config,instruction,dict(problem=lesson['problem'],targetLevel=lesson['targetLevel'],knowledgePoints=lesson['knowledgePoints']),progress,enable_thinking=True,thinking_budget=8192)
                if not isinstance(raw,dict) or not isinstance(raw.get('problems'),list) or len(raw['problems'])!=3:
                    raise GenerationError('structure','变式题数量或结构不完整，请重试。')
                problems=[]
                for i,value in enumerate(raw['problems']):
                    p=normalize_problem(value,lesson['targetLevel'])
                    if not p['input'] or not p['output'] or not p['cases'] or sum(c['score'] for c in p['cases'])!=100:
                        raise GenerationError('structure','变式题缺少输入输出或测试点无效，请重试。')
                    p.update(id=f'practice-{ident}-{i+1}',kind='generated',level=lesson['targetLevel'],sourceProblemId=problem_key(lesson['problem']),
                             sampleLabel='AI 生成示例',casesSource='AI 生成练习点，尚未独立验证',difficulty=['巩固','同等','进阶'][i])
                    problems.append(p)
                answer=dict(id=ident,lessonId=lesson['id'],sourceProblemId=problem_key(lesson['problem']),createdAt=time.time(),problems=problems)
                self.save('practice',ident,answer)
            else: raise GenerationError('invalid_kind','未知任务。')
            self.update(ident,status='completed',message='完成',result=answer)
        except GenerationError as exc:
            self.update(ident,status='failed',message=str(exc),error={'code':exc.code,'message':str(exc)})
        except Exception:
            self.update(ident,status='failed',message='生成失败，请重试。',error={'code':'internal','message':'生成或保存失败，请检查文件权限与服务配置。'})

    def import_file(self, payload, progress):
        name=payload['filename']; suffix=Path(name).suffix.lower(); content=payload['bytes']; level=payload['level']
        if suffix=='.json':
            try: p=json.loads(content.decode('utf-8-sig'))
            except (ValueError,UnicodeError): raise GenerationError('invalid_file','JSON 文件无效，请检查编码和内容。')
        elif suffix in ('.txt','.md'):
            try: text=content.decode('utf-8-sig')
            except UnicodeError:
                try: text=content.decode('gb18030')
                except UnicodeError: raise GenerationError('invalid_file','文本编码无法识别，请另存为 UTF-8。')
            p={'title':Path(name).stem,'description':text}
        else:
            images=()
            if suffix=='.pdf':
                try:
                    from pypdf import PdfReader
                except ImportError: raise GenerationError('pdf_dependency','当前 Python 缺少 pypdf。请运行 install-all.bat，按依赖检查提示补齐后重试。')
                try:
                    reader=PdfReader(io.BytesIO(content))
                    if len(reader.pages)>20: raise GenerationError('invalid_file','一次最多上传 20 页 PDF，请先截取题目页。')
                    text='\n'.join(page.extract_text() or '' for page in reader.pages)
                except GenerationError: raise
                except Exception: raise GenerationError('invalid_file','PDF 无法读取，可能已加密或损坏。')
                if len(text.strip())<20: raise GenerationError('scanned_pdf','这份 PDF 没有可提取文字，请将题目页转为图片上传。')
                if len(text)>50000: raise GenerationError('invalid_file','PDF 内容过多，请只上传一道题的页面。')
            else:
                valid=(suffix=='.png' and content.startswith(b'\x89PNG\r\n\x1a\n') or suffix in ('.jpg','.jpeg') and content.startswith(b'\xff\xd8') or suffix=='.webp' and content[:4]==b'RIFF' and content[8:12]==b'WEBP')
                if not valid: raise GenerationError('invalid_file','图片类型与内容不匹配。')
                mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[suffix]
                images=('data:'+mime+';base64,'+base64.b64encode(content).decode(),)
                text='请识别附件中的一道编程题。'
            shape={k:v for k,v in PROBLEM_SHAPE.items() if k not in ('cases','hints','explanation')}
            p=completion(self.config,'将提供的题面整理为一道题，保留全部条件，不补写缺失信息。若有多题或内容不清楚，返回 {"error":"请截取清晰的单道题"}。无样例或输入输出格式时对应字段留空，不能猜测。返回结构：'+json.dumps(shape,ensure_ascii=False),{'text':text,'level':level},progress,images)
            if isinstance(p,dict) and p.get('error'): raise GenerationError('recognition','题目不完整或包含多题，请截取清晰的单道题后重试。')
        result=normalize_problem(p,level)
        result.update(kind='uploaded',id='upload-'+uuid.uuid4().hex,casesSource='上传文件或识别所得测试点，请核对',sampleLabel='上传题目示例')
        return result


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        server_version='CodeArenaLearning/1.0'

        def log_message(self, format, *args):
            # Do not log user payloads, credentials, or upstream response bodies.
            pass

        def origin_allowed(self):
            host=self.headers.get('Host','')
            if host not in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'):
                return False
            origin=self.headers.get('Origin','')
            if not origin or origin in (f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
                return True
            if not re.fullmatch(r'chrome-extension://[a-p]{32}',origin): return False
            manifest=ROOT.parent/'native-host/com.codearena.cpp_judge.json'
            if manifest.is_file():
                try: return origin+'/' in json.loads(manifest.read_text(encoding='utf-8-sig')).get('allowed_origins',[])
                except (ValueError,OSError): return False
            return True  # Initial setup: only local extension origins, never arbitrary web pages.

        def respond(self, status, value, content_type='application/json; charset=utf-8'):
            payload=json.dumps(value,ensure_ascii=False).encode() if not isinstance(value,bytes) else value
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(payload)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            if self.headers.get('Origin') and self.origin_allowed():
                self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
                self.send_header('Vary','Origin')
            self.end_headers()
            try: self.wfile.write(payload)
            except (BrokenPipeError,ConnectionResetError): pass

        def error(self, status, code, message): self.respond(status,dict(error=dict(code=code,message=message)))

        def do_OPTIONS(self):
            if not self.origin_allowed(): return self.error(403,'origin','不允许此来源访问本地学习服务。')
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin',''))
            self.send_header('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers','Content-Type')
            self.send_header('Access-Control-Allow-Private-Network','true')
            self.end_headers()

        def do_GET(self):
            if not self.origin_allowed(): return self.error(403,'origin','不允许此来源访问本地学习服务。')
            path=unquote(urlsplit(self.path).path)
            try:
                if path=='/api/health':
                    return self.respond(200,dict(service='codearena-learning',version=12,runCaseSchema=2,processId=os.getpid(),instancePath=str(ROOT),capabilities=['topicSyntaxLabs','knowledgeTopics','pageChat','socraticPageChat','imagePageChat','runCases','codeAnalysis','practiceSourceSelection','uniqueLessons','deleteLesson'],configured=bool(app.config['key']),model=app.config['model'],visionModel=app.config['visionModel'],configSource=app.config['source']))
                if path=='/api/analysis-settings':return self.respond(200,app.analysis_settings.public())
                if path.startswith('/api/jobs/'):
                    ident=identifier(path.rsplit('/',1)[-1])
                    with app.lock: value=dict(app.jobs.get(ident) or {})
                    if not value: raise GenerationError('not_found','任务不存在。')
                    return self.respond(200,value)
                if path=='/api/lessons':
                    return self.respond(200,[dict({k:v.get(k) for k in ('id','title','targetLevel','createdAt','summary','model')},problemId=problem_key(v.get('problem',{}))) for v in app.list_records('lessons')])
                if path.startswith('/api/lessons/'): return self.respond(200,app.read('lessons',path.rsplit('/',1)[-1]))
                if path=='/api/practice': return self.respond(200,app.list_records('practice'))
                relative=path.lstrip('/') or 'index.html'
                allowed=relative in ('index.html','app.js','styles.css','problem.json') or relative.startswith(('ui/','data/gesp/','vendor/'))
                if '\\' in relative or any(part in ('.','..') for part in relative.split('/')):
                    allowed=False
                target=(ROOT/relative).resolve()
                if not allowed or ROOT not in target.parents or not target.is_file(): raise GenerationError('not_found','资源不存在。')
                mime=mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
                if target.suffix=='.js': mime='application/javascript'
                return self.respond(200,target.read_bytes(),mime+'; charset=utf-8')
            except GenerationError as exc: self.error(404,exc.code,str(exc))
            except Exception: self.error(500,'internal','读取失败，请检查服务数据。')

        def do_DELETE(self):
            if not self.origin_allowed(): return self.error(403,'origin','不允许此来源访问本地学习服务。')
            path=unquote(urlsplit(self.path).path)
            if not re.fullmatch(r'/api/lessons/[a-f0-9]{32}',path): return self.error(404,'not_found','课件不存在。')
            try: self.respond(200,app.delete_lesson(path.rsplit('/',1)[-1]))
            except GenerationError as exc: self.error(409 if exc.code=='busy' else 404,exc.code,str(exc))
            except OSError: self.error(500,'storage','删除失败，请检查文件权限。')

        def do_POST(self):
            if not self.origin_allowed(): return self.error(403,'origin','不允许此来源访问本地学习服务。')
            if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.error(415,'content_type','请使用 application/json。')
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=MAX_BODY: return self.error(413,'size','请求内容为空或超过大小限制。')
                body=json.loads(self.rfile.read(size))
                if not isinstance(body,dict): raise ValueError()
                path=urlsplit(self.path).path
                if path=='/api/lessons':
                    level=body.get('targetLevel',5)
                    if type(level)!=int or not 1<=level<=8: raise GenerationError('invalid_level','目标等级必须为 1～8。')
                    requirements=body.get('requirements','')
                    if not isinstance(requirements,str) or len(requirements)>2000: raise GenerationError('requirements','补充要求限 2000 字。')
                    p=normalize_problem(body.get('problem'),level)
                    if p.get('kind')=='knowledge-topic':
                        if p['level']!=level or len(p['tags'])!=1:
                            raise GenerationError('invalid_topic','知识点讲解必须保持入口等级，且只讲一个知识点。')
                        validate_topic(dict(topic=p['tags'][0],targetLevel=level))
                    job=app.enqueue('lesson',dict(problem=p,targetLevel=level,requirements=requirements))
                elif path=='/api/imports':
                    name=body.get('filename',''); encoded=body.get('contentBase64',''); level=body.get('level',5)
                    if not isinstance(name,str) or len(name)>250 or Path(name).suffix.lower() not in ('.json','.txt','.md','.pdf','.png','.jpg','.jpeg','.webp'):
                        raise GenerationError('file_type','支持 JSON、TXT、MD、PDF、PNG、JPEG 和 WebP。')
                    if type(level)!=int or not 1<=level<=8 or not isinstance(encoded,str): raise ValueError()
                    content=base64.b64decode(encoded,validate=True)
                    if not content or len(content)>MAX_FILE: return self.error(413,'size','上传文件须为 1 字节～8 MiB。')
                    job=app.enqueue('import',dict(filename=name,bytes=content,level=level))
                elif path=='/api/chat':
                    ident=identifier(body.get('lessonId'))
                    lesson=app.read('lessons',ident)
                    page_index=body.get('pageIndex')
                    messages=body.get('messages')
                    if type(page_index)!=int or not 0<=page_index<len(lesson['pages']):
                        raise GenerationError('invalid_page','指定课件页不存在。')
                    if not isinstance(messages,list) or not 1<=len(messages)<=20:
                        raise GenerationError('invalid_messages','本次问答最多携带 20 条历史消息。')
                    checked=[]
                    for message in messages:
                        if not isinstance(message,dict) or message.get('role') not in ('user','assistant') or not isinstance(message.get('content'),str) or not message['content'].strip() or len(message['content'])>8000:
                            raise GenerationError('invalid_messages','问答消息格式无效。')
                        checked.append(dict(role=message['role'],content=message['content'].strip()))
                        images=chat_attachments(message)
                        if images: checked[-1]['attachments']=images
                    if sum(len(m.get('attachments',[])) for m in checked)>3:
                        raise GenerationError('invalid_images','每次问答最多携带 3 张图片，请减少图片。')
                    if checked[-1]['role']!='user' or len(checked[-1]['content'])>4000 or sum(len(m['content']) for m in checked)>24000:
                        raise GenerationError('invalid_messages','请输入不超过 4000 字的问题，或缩短历史对话。')
                    visual_context=body.get('visualContext','')
                    if not isinstance(visual_context,str) or len(visual_context)>6000: raise GenerationError('invalid_messages','图解上下文无效。')
                    job=app.enqueue('chat',dict(lessonId=ident,pageIndex=page_index,messages=checked,visualContext=visual_context))
                elif path=='/api/analysis-access':
                    app.analysis_settings.require_password(body.get('password'))
                    return self.respond(200,app.analysis_settings.public())
                elif path=='/api/analysis-settings':
                    return self.respond(200,app.analysis_settings.update(body))
                elif path=='/api/code-analysis':
                    code=body.get('code');current=body.get('input','')
                    if not isinstance(code,str) or not code.strip() or len(code)>50000:
                        raise GenerationError('invalid_code','代码分析支持 1～50000 字的 C++ 代码。')
                    code=code.replace('\r\n','\n').replace('\r','\n')
                    if len(code.split('\n'))>2000:raise GenerationError('invalid_code','代码分析最多支持 2000 行。')
                    if not isinstance(current,str) or len(current)>20000:raise GenerationError('invalid_input','标准输入不能超过 20000 字。')
                    problem=normalize_problem(body.get('problem'))
                    authorize_analysis(body.get('gate'),app.analysis_settings)
                    # Credentials and unlock history never enter model prompts or persisted jobs.
                    job=app.enqueue('code-analysis',dict(problem=problem,code=code,input=current))
                elif path=='/api/run-cases':
                    ident=identifier(body.get('lessonId'))
                    lesson=app.read('lessons',ident)
                    page=body.get('pageIndex');current=body.get('currentInput','')
                    if type(page)!=int or not 0<=page<len(lesson['pages']) or not lesson['pages'][page].get('code','').strip():
                        raise GenerationError('invalid_page','请选择含代码的课件页。')
                    if not isinstance(current,str) or len(current)>20000:
                        raise GenerationError('invalid_input','当前输入不能超过 20000 字。')
                    job=app.enqueue('run-case',dict(lessonId=ident,pageIndex=page,currentInput=current))
                elif path=='/api/knowledge-practice':
                    topic,level=validate_topic(body)
                    if bank_candidates(app.bank,topic,level):
                        raise GenerationError('bank_available','题库已有本知识点的专项练习，请优先使用题库题目。')
                    job=app.enqueue('topic-practice',dict(topic=topic,targetLevel=level))
                elif path=='/api/practice':
                    if 'problem' in body:
                        problem=normalize_problem(body['problem'])
                        if problem.get('kind')=='knowledge-topic':raise GenerationError('invalid_problem','知识点请选择专项练习入口。')
                        job=app.enqueue('practice',dict(problem=problem))
                    else:
                        ident=body.get('lessonId','')
                        if not isinstance(ident,str): raise ValueError()
                        app.read('lessons',ident)
                        job=app.enqueue('practice',dict(lessonId=ident))
                else: return self.error(404,'not_found','接口不存在。')
                self.respond(202,job)
            except GenerationError as exc: self.error(429 if exc.code=='busy' else 404 if exc.code=='not_found' else 400,exc.code,str(exc))
            except (ValueError,TypeError,binascii.Error): self.error(400,'invalid_request','请求 JSON、字段或 Base64 无效。')
            except Exception: self.error(500,'internal','请求处理失败，请检查服务配置。')
    return Handler


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int)
    args=parser.parse_args()
    app=Application()
    server=ThreadingHTTPServer(('127.0.0.1',args.port or app.config['port']),make_handler(app))
    print(f'CodeArena learning service: http://127.0.0.1:{server.server_port} | {app.config["model"]}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close(); app.pool.shutdown(wait=False,cancel_futures=True)


if __name__=='__main__': main()
