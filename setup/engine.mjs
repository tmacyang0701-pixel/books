import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync,appendFileSync,readdirSync,mkdtempSync,rmSync,copyFileSync,lstatSync,statSync,readlinkSync,symlinkSync,unlinkSync} from 'node:fs';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,delimiter,resolve} from 'node:path';
import {tmpdir,release} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const policy={nodeMajor:22,python:[3,11],gccMajor:9};
export const isBundlePythonPath=path=>/(?:^|[\\/])runtime[\\/]python-full[\\/]python\.exe$/i.test(String(path||''));
export function atLeast(value,minimum){const parts=String(value||'').match(/\d+/g)?.map(Number)||[];for(let i=0;i<minimum.length;i++){if((parts[i]||0)!==minimum[i])return (parts[i]||0)>minimum[i];}return true;}
const unique=values=>[...new Set(values.filter(Boolean).map(v=>String(v).replace(/^"|"$/g,'')))];
const successful=r=>r&&!r.error&&r.status===0;
function resultJSON(result){if(!successful(result))return null;try{return JSON.parse(result.stdout.trim());}catch{return null;}}

// Node's native recursive cpSync can fail-fast on Windows Unicode paths.
// Copy entries individually so a Chinese installation/profile path is supported.
function copyConfigDirectory(source,target){
 mkdirSync(target,{recursive:true});
 for(const entry of readdirSync(source,{withFileTypes:true})){
  const from=join(source,entry.name),to=join(target,entry.name);
  if(entry.isDirectory())copyConfigDirectory(from,to);
  else if(entry.isSymbolicLink()){
   const link=resolve(dirname(from),readlinkSync(from)),existing=lstatSync(to,{throwIfNoEntry:false});
   if(existing?.isSymbolicLink()&&resolve(dirname(to),readlinkSync(to))===link)continue;
   if(existing)unlinkSync(to);
   symlinkSync(link,to,statSync(from).isDirectory()?'junction':'file');
  }else if(entry.isFile())copyFileSync(from,to);
 }
}

export function nativeHost(root,env=process.env){
 const powershell=join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const environment=extra=>{const keys=new Set(Object.keys(extra).map(k=>k.toLowerCase()));return {...Object.fromEntries(Object.entries(env).filter(([key])=>!keys.has(key.toLowerCase()))),...extra};};
 const probe=(file,args,extra={})=>spawnSync(file,args,{env:environment(extra),encoding:'utf8',timeout:30000,windowsHide:true});
 const ps=(code,extra={})=>probe(powershell,['-NoProfile','-Command','[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false); '+code],extra);
 function registry(script){return resultJSON(ps(script))||[];}
 const where=name=>{const r=probe('where.exe',[name]);return successful(r)?r.stdout.split(/\r?\n/).filter(Boolean):[];};
 return {exists:existsSync,probe,where,powershell,env,
  pythonRegistry:()=>registry("$r=@(); foreach($base in @('HKCU:\\Software\\Python\\PythonCore','HKLM:\\Software\\Python\\PythonCore','HKLM:\\Software\\WOW6432Node\\Python\\PythonCore')){if(Test-Path $base){foreach($k in Get-ChildItem $base){$p=Get-ItemProperty ($k.PSPath+'\\InstallPath') -ErrorAction SilentlyContinue;if($p){if($p.ExecutablePath){$r+=$p.ExecutablePath}else{$r+=(Join-Path $p.'(default)' 'python.exe')}}}}}; ConvertTo-Json -Compress -InputObject @($r)"),
  devRegistry:()=>registry("$r=@();foreach($base in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')){if(Test-Path $base){Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {$p=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;if($p.DisplayName -match 'Dev-C\\+\\+|Dev-Cpp'){if($p.InstallLocation){$r+=$p.InstallLocation};if($p.DisplayIcon){$r+=Split-Path ($p.DisplayIcon -replace ',\\d+$','' -replace '\"','')};if($p.UninstallString -match '^\"?(.+?\\\\uninstall\\.exe)\"?'){$r+=Split-Path $matches[1]}}}}};ConvertTo-Json -Compress -InputObject @($r)"),
  localPython:()=>{if(!env.LOCALAPPDATA)return [];return [join(env.LOCALAPPDATA,'Programs','Python'),join(env.LOCALAPPDATA,'Python')].flatMap(base=>{try{return readdirSync(base,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>join(base,x.name,'python.exe'));}catch{return [];}});},
  fileVersion:path=>{const r=ps("(Get-Item -LiteralPath $env:HMT_INSPECT_FILE).VersionInfo.ProductVersion",{HMT_INSPECT_FILE:path});return successful(r)?r.stdout.trim():'';},
  async run(file,args,extra={}){return new Promise((resolve,reject)=>{const child=spawn(file,args,{env:environment(extra),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout=(stdout+b).slice(-12000));child.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));const timer=setTimeout(()=>{child.kill();reject(new Error('操作超过20分钟，请检查安装进程后重试。'));},20*60*1000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);resolve({status:code,stdout,stderr});});});},
 };
}

export class Installer{
 constructor(root,{host=nativeHost(root),notify=()=>{},mode='install',bootstrapNode=process.execPath}={}){
  this.root=root;this.host=host;this.notify=notify;this.mode=mode;this.bootstrapNode=bootstrapNode;this.logs=[];this.report={schema:1,policy,startedAt:new Date().toISOString(),mode,components:{},actions:[],success:false};this.selection={};this.phase='';
  try{this.previous=JSON.parse(readFileSync(join(root,'runtime-selection.json'),'utf8'));}catch{this.previous={};}
 }
 log(text){const line=new Date().toLocaleTimeString()+' '+text;this.logs.push(line);appendFileSync(join(this.root,'setup.log'),line+'\n');}
 checkCancelled(){if(existsSync(join(this.root,'.setup','cancel'))){const error=new Error('已停止；已完成的组件会保留，再次运行会重新检测。');error.code='CANCELLED';throw error;}}
 publish(step,message,{phase='processing',percent=null}={}){if(phase==='processing')this.checkCancelled();if(this.phase!==message){this.phase=message;this.phaseStarted=Date.now();this.log(message);}const state={state:phase,step,totalSteps:8,completedSteps:phase==='completed'?8:Math.max(1,step-1),message,percent,phaseStarted:this.phaseStarted,logs:this.logs.slice(-100),report:this.report};this.notify(state);}
 async during(step,message,operation){this.publish(step,message);const timer=setInterval(()=>{if(!existsSync(join(this.root,'.setup','cancel')))this.publish(step,message);},1000);try{return await operation();}finally{clearInterval(timer);}}
 node(){
  const e=this.host.env;
  const candidates=unique([this.previous.node,this.bootstrapNode,...this.host.where('node.exe'),...(e.ProgramFiles?[join(e.ProgramFiles,'nodejs','node.exe')]:[]),join(this.root,'runtime','node-v22.23.5-win-x64','node.exe')]);
  let first=null;for(const path of candidates){if(!this.host.exists(path)||/\\WindowsApps\\/i.test(path))continue;const r=resultJSON(this.host.probe(path,['-p',"JSON.stringify({version:process.versions.node,arch:process.arch})"]));if(!r)continue;const info={path,version:r.version,arch:r.arch,ready:atLeast(r.version,[policy.nodeMajor])};first??=info;if(info.ready)return info;}return first||{ready:false,reason:'未找到可用 Node.js'};
 }
 inspectPython(path){
  if(!this.host.exists(path))return {path,exists:false,ready:false,reason:'Python 路径不存在'};
  if(/\\WindowsApps\\/i.test(path))return {path,exists:true,ready:false,reason:'跳过 Windows Store 启动别名'};
  const code="import sys,json,importlib.util\nresult={'version':list(sys.version_info[:3]),'executable':sys.executable,'pip':False,'stdlib':False,'ensurepip':importlib.util.find_spec('ensurepip') is not None}\ntry:\n import pip\n result['pip']=True\n result['pipVersion']=pip.__version__\nexcept Exception as error: result['pipError']=str(error)\ntry:\n import ssl,sqlite3\n result['stdlib']=True\nexcept Exception as error: result['stdlibError']=str(error)\nprint(json.dumps(result))";
  const probe=this.host.probe(path,['-I','-c',code]),raw=resultJSON(probe);
  if(!raw||!Array.isArray(raw.version)||!raw.version.length)return {path,exists:true,ready:false,exitCode:probe.status,signal:probe.signal,errorCode:probe.error?.code,stderr:String(probe.stderr||'').trim().slice(-3000),stdout:String(probe.stdout||'').trim().slice(-1000),reason:probe.error?.code==='ETIMEDOUT'?'Python 启动超时':probe.error?'Python 启动失败：'+probe.error.message:!successful(probe)?'Python 进程异常退出，代码 '+probe.status:'Python 返回的检测结果不是有效 JSON'};
  const version=raw.version.join('.'),reasons=[];
  if(!atLeast(version,policy.python))reasons.push('版本 '+version+' 低于 3.11');
  if(!raw.pip)reasons.push('pip 无法导入：'+(raw.pipError||raw.reason||'缺失或损坏'));
  if(!raw.stdlib)reasons.push('ssl/sqlite3 无法导入：'+(raw.stdlibError||raw.reason||'缺失或损坏'));
  return {path,exists:true,version,executable:raw.executable,pip:raw.pip,pipVersion:raw.pipVersion,stdlib:raw.stdlib,ensurepip:raw.ensurepip,pipError:raw.pipError,stdlibError:raw.stdlibError,reason:reasons.join('；'),ready:reasons.length===0};
 }
 python(){
  const candidates=unique([this.previous.python,this.host.env.HMT_PYTHON_EXE,join(this.root,'runtime','python-full','python.exe'),...this.host.where('python.exe'),...this.host.where('python3.exe'),...this.host.pythonRegistry(),...this.host.localPython()]);
  const findings=candidates.map(path=>this.inspectPython(path));
  const selected=findings.find(info=>info.ready)||findings.find(info=>info.version)||findings.find(info=>info.exists&&!/\\WindowsApps\\/i.test(info.path))||{ready:false,reason:'未找到可用 Python；请检查检测报告中的路径'};
  const result={...selected,diagnostics:findings};this.report.components.python=result;return result;
 }
 async repairRegisteredPython(exe,logs,detected){
  const registered=unique(this.host.pythonRegistry());
  const stale=registered.filter(path=>isBundlePythonPath(path)&&!this.host.exists(path));
  if(!stale.length)return detected;
  this.checkCancelled();
  const logFile=join(logs,'python-repair-'+Date.now()+'.log');
  this.report.pythonInstallation.repair={reason:'registered-bundle-path-missing',registeredPaths:stale,logFile};
  this.log('系统仍登记旧整合包中的 Python，但对应文件已不存在：'+stale.join('；'));
  // CPython changes INSTALL to MODIFY when the bundle is already registered.
  // Explicit REPAIR restores missing MSI files to the registered installation.
  // Do not override TargetDir here: it does not relocate an installed product.
  const result=await this.during(4,'检测到旧安装记录但 Python 文件缺失，正在离线修复原有安装',()=>this.host.run(exe,['/repair','/quiet','/norestart','/log',logFile,'Include_launcher=0','PrependPath=0','Shortcuts=0']));
  Object.assign(this.report.pythonInstallation.repair,{exitCode:result.status,rebootRequired:result.status===3010,stderr:result.stderr});
  this.report.pythonInstallation.rebootRequired ||= result.status===3010;
  this.report.actions.push({component:'python',action:'repair-attempt',exitCode:result.status});
  const after=this.python();
  if(![0,3010].includes(result.status))throw new Error('Python 旧安装修复失败，退出码 '+result.status+'。修复日志：'+logFile);
  return after;
 }
 toolchain(home){
  const bins=['TDM-GCC-64','MinGW64','MinGW','MinGW32'].map(folder=>join(home,folder,'bin'));const findings=[];
  for(const bin of bins){const tools={};for(const [key,file]of Object.entries({gcc:'gcc.exe',gpp:'g++.exe',gdb:'gdb.exe',make:'mingw32-make.exe'})){const path=join(bin,file);if(!this.host.exists(path)){tools[key]={path,ready:false,reason:'缺失'};continue;}const r=this.host.probe(path,key==='gcc'||key==='gpp'?['-dumpfullversion','-dumpversion']:['--version'],{PATH:bin+delimiter+(this.host.env.PATH||'')});const version=successful(r)?r.stdout.trim().split(/\r?\n/)[0]:'';tools[key]={path,version,ready:successful(r)&&(key==='gcc'||key==='gpp'?atLeast(version,[policy.gccMajor]):true),reason:successful(r)?'':'无法运行'};}const result={home,bin,tools,ready:Object.values(tools).every(t=>t.ready)};findings.push(result);if(result.ready)return result;}
  return findings.sort((a,b)=>Object.values(b.tools).filter(t=>t.ready).length-Object.values(a.tools).filter(t=>t.ready).length)[0];
 }
 devCpp(){
  const e=this.host.env,bases=[e['ProgramFiles(x86)'],e.ProgramFiles].filter(Boolean);const homes=unique([this.previous.devCppHome,e.DEVCPP_HOME,join(this.root,'runtime','Dev-Cpp'),...this.host.devRegistry(),...bases.flatMap(base=>[join(base,'Embarcadero','Dev-Cpp'),join(base,'Dev-Cpp')]),'C:\\Dev-Cpp']);let first=null;
  for(const home of homes){const ide=join(home,'devcpp.exe');if(!this.host.exists(ide))continue;const toolchain=this.toolchain(home),info={home,ide,version:this.host.fileVersion(ide),toolchain,ready:toolchain.ready};first??=info;if(info.ready)return info;}return first||{ready:false,reason:'未找到 Dev-C++ IDE'};
 }
 async verifyArtifact(sub,record){const path=join(this.root,sub,record.filename||record.assetName);if(!existsSync(path))throw new Error('缺少安装文件：'+path);const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);if(digest.digest('hex')!==record.sha256)throw new Error('安装文件校验失败：'+path);return path;}
 async installPython(){
  const meta=JSON.parse(readFileSync(join(this.root,'python','downloads.json'),'utf8')),record=meta.files.find(x=>x.filename.endsWith('.exe')),exe=await this.verifyArtifact('python',record),target=join(this.root,'runtime','python-full');
  const logs=join(this.root,'.setup','logs');mkdirSync(logs,{recursive:true});const logFile=join(logs,'python-install-'+Date.now()+'.log');
  this.report.pythonInstallation={target,installer:exe,logFile};
  const result=await this.during(4,'正在离线安装 Python 与 pip（已有旧版本保留）',()=>this.host.run(exe,['/quiet','/norestart','/log',logFile,'InstallAllUsers=0','Include_pip=1','Include_exe=1','Include_lib=1','Include_test=0','Include_launcher=0','Include_debug=0','Include_symbols=0','PrependPath=0','Shortcuts=0','TargetDir='+target]));
  Object.assign(this.report.pythonInstallation,{exitCode:result.status,rebootRequired:result.status===3010,stderr:result.stderr});
  this.previous.python=join(target,'python.exe');let detected=this.python();
  if(![0,3010].includes(result.status))throw new Error('Python 安装失败，退出码 '+result.status+'。安装日志：'+logFile);
  this.report.actions.push({component:'python',action:'installer-completed',exitCode:result.status});
  if(!detected.ready&&!detected.diagnostics.some(info=>info.exists&&!/\\WindowsApps\\/i.test(info.path)))detected=await this.repairRegisteredPython(exe,logs,detected);
  const registered=unique(this.host.pythonRegistry());
  const local=detected.diagnostics.find(info=>info.stdlib&&info.ensurepip&&!info.pip&&(info.path===this.previous.python||registered.includes(info.path)&&isBundlePythonPath(info.path)));
  if(!detected.ready&&local?.stdlib&&local.ensurepip&&!local.pip&&atLeast(local.version,policy.python)){
   this.checkCancelled();const repaired=await this.during(4,'Python 已可运行，正在使用自带 ensurepip 离线补齐 pip',()=>this.host.run(local.path,['-I','-m','ensurepip','--upgrade','--default-pip'],{PIP_NO_INDEX:'1',PIP_DISABLE_PIP_VERSION_CHECK:'1'}));
   this.report.pythonInstallation.pipRepair={exitCode:repaired.status,stderr:repaired.stderr};this.report.actions.push({component:'pip',action:'repair-attempt',exitCode:repaired.status});detected=this.python();
  }
  if(!detected.ready){const details=detected.diagnostics.filter(info=>info.exists&&!/\\WindowsApps\\/i.test(info.path)).map(info=>info.path+'：'+info.reason+(info.stderr?'；'+info.stderr:''));throw new Error('Python 安装后检查失败：'+(details.join('\n')||'未找到 Python 可执行文件，目标路径：'+this.previous.python)+(this.report.pythonInstallation.rebootRequired?'。安装器要求重启 Windows 后再检测':'')+'。安装日志：'+logFile+(this.report.pythonInstallation.repair?'。旧安装修复日志：'+this.report.pythonInstallation.repair.logFile:''));}
  this.report.actions.push({component:'python',action:'verified',path:detected.path});
  return detected;
 }
 backupDevConfig(){const base=this.host.env.APPDATA;if(!base)return null;const source=join(base,'Embarcadero','Dev-Cpp');if(!existsSync(source))return null;const target=join(this.root,'.setup','backups','devcpp-'+Date.now());copyConfigDirectory(source,target);this.log('已备份旧 Dev-C++ 配置。');return {source,target};}
 restoreDevConfig(backup){if(!backup)return;copyConfigDirectory(backup.target,backup.source);this.log('已保留并恢复已有 Dev-C++ 配置。');}
 async installDevCpp(){
  const record=JSON.parse(readFileSync(join(this.root,'devcpp','downloads.json'),'utf8')),exe=await this.verifyArtifact('devcpp',record),target=join(this.root,'runtime','Dev-Cpp'),backup=this.backupDevConfig();
  let result;try{result=await this.during(5,'正在离线安装 Dev-C++ 完整组件；如弹出 Windows 授权请允许',()=>this.host.run(this.host.powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(this.root,'setup','install-devcpp-elevated.ps1')],{HMT_INSTALLER_FILE:exe,HMT_DEVCPP_TARGET:target}));}finally{this.restoreDevConfig(backup);}
  if(!successful(result))throw new Error('Dev-C++ 安装失败或管理员授权被取消。'+(result?.stderr||''));
  this.report.actions.push({component:'devCpp',action:'installed'});this.previous.devCppHome=target;const detected=this.devCpp();if(!detected.ready)throw new Error('Dev-C++ 安装后组件不完整，请关闭旧 IDE 后重试并查看检测报告。');return detected;
 }
 async validateRuntimes(){
  const python=await this.host.run(this.selection.python,['-I','-c',"import sys,pip,ssl,sqlite3,json;print(json.dumps({'python':sys.version.split()[0],'pip':pip.__version__}))"]);if(!successful(python))throw new Error('Python 或 pip 的实际运行检查失败。');
  await this.validateCpp(this.selection.cppBin);
 }
 async validateCpp(bin){
  const dir=mkdtempSync(join(tmpdir(),'hmt-setup-cpp-')),extra={PATH:bin+delimiter+(this.host.env.PATH||'')};
  try{for(const [language,source,compiler,flag,expected]of [['c','#include <stdio.h>\nint main(void){puts("C_OK");return 0;}\n','gcc.exe','-std=c11','C_OK'],['cpp','#include <iostream>\n#include <vector>\n#include <numeric>\nint main(){std::vector<int> v{1,2,3};std::cout<<std::accumulate(v.begin(),v.end(),0);}\n','g++.exe','-std=c++17','6']]){const file=join(dir,'check.'+language),output=join(dir,'check-'+language+'.exe');writeFileSync(file,source);const built=await this.host.run(join(bin,compiler),[flag,file,'-o',output],extra);if(!successful(built))throw new Error('C/C++ 编译检查失败：'+built.stderr);const ran=await this.host.run(output,[],extra);if(!successful(ran)||ran.stdout.trim()!==expected)throw new Error('C/C++ 运行检查失败。');this.log(language+' 标准头文件、链接与运行检查通过。');}}finally{rmSync(dir,{recursive:true,force:true});}
 }
 async execute(){
  try{
   this.publish(2,'正在检测 Node.js、Python 版本与 pip');const node=this.node(),python=this.python();this.report.components.node=node;this.report.components.python=python;if(!node.ready)throw new Error('Node.js 准备失败，需要 22 或更新版本。');
   this.publish(3,'正在检测 Dev-C++、GCC、G++、GDB 和 Make');const dev=this.devCpp();this.report.components.devCpp=dev;
   if(dev.ready){try{await this.during(3,'正在检查已有 C/C++ 标准库、编译和运行',()=>this.validateCpp(dev.toolchain.bin));dev.compilationVerified=true;}catch(error){if(error.code==='CANCELLED')throw error;dev.ready=false;dev.reason=error.message;dev.compilationVerified=false;this.log('已有工具链编译运行未通过，将补齐完整组件。');}}
   this.checkCancelled();
   const nodeAction=this.host.env.HMT_NODE_BOOTSTRAPPED==='1'?'prepared':'skipped';this.report.actions.push({component:'node',action:nodeAction});this.log('Node.js '+node.version+(nodeAction==='prepared'?' 已从离线包准备完成。':' 可用，复用现有路径。'));
   this.log(python.ready?'Python '+python.version+' 与 pip 可用，跳过安装。':'Python 缺失、版本不足或 pip 不可用，将补装独立完整版本。');
   this.log(dev.ready?'Dev-C++ 与全部编译组件可用，跳过安装。':'Dev-C++ 或编译组件缺失/不可用，将补装完整版本到本包目录。');
   if(this.mode==='detect'){this.report.allReady=node.ready&&python.ready&&dev.ready;this.finish('detected','环境检测完成，未调用 Python 或 Dev-C++ 安装程序。');return this.report;}
   this.selection.node=node.path;
   this.publish(4,python.ready?'Python 和 pip 已满足要求，跳过安装':'正在准备 Python 安装');const selectedPython=python.ready?python:await this.installPython();if(python.ready)this.report.actions.push({component:'python',action:'skipped'});this.selection.python=selectedPython.path;this.report.components.python=selectedPython;
   this.publish(5,dev.ready?'Dev-C++ 标准组件已齐全，跳过安装':'正在准备 Dev-C++ 完整组件安装');const selectedDev=dev.ready?dev:await this.installDevCpp();if(dev.ready)this.report.actions.push({component:'devCpp',action:'skipped'});this.selection.devCppHome=selectedDev.home;this.selection.cppBin=selectedDev.toolchain.bin;this.report.components.devCpp=selectedDev;
   this.publish(6,'正在准备应用配置、构建并校验');const app=join(this.root,'application'),env=join(app,'.env');if(!existsSync(env))writeFileSync(env,readFileSync(join(app,'.env.example')));for(const script of ['scripts/build.mjs','scripts/validate-artifact.mjs']){const r=await this.host.run(this.selection.node,[join(app,script)]);if(!successful(r))throw new Error('应用构建检查失败：'+r.stderr);}
   this.publish(7,'正在实际检查 Python、C 和 C++ 编译运行');await this.validateRuntimes();
   this.publish(8,'正在保存运行环境并创建桌面快捷方式');writeFileSync(join(this.root,'runtime-selection.json'),JSON.stringify({...this.selection,updatedAt:new Date().toISOString()},null,2)+'\n');const shortcut=await this.host.run(this.host.powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(this.root,'setup','create-shortcuts.ps1')],{HMT_BUNDLE_ROOT:this.root,HMT_SELECTED_PYTHON:this.selection.python,HMT_SELECTED_DEVCPP:join(this.selection.devCppHome,'devcpp.exe')});if(!successful(shortcut))throw new Error('组件已准备，但创建快捷方式失败：'+shortcut.stderr);
   this.report.success=true;this.report.allReady=true;this.report.selection=this.selection;this.finish('completed','安装完成：Node、Python、Dev-C++ 及编译组件均已检查。');return this.report;
  }catch(error){this.report.error=error.message;this.finish(error.code==='CANCELLED'?'cancelled':'failed',error.message);if(error.code==='CANCELLED')return this.report;throw error;}
 }
 finish(state,message){this.report.finishedAt=new Date().toISOString();writeFileSync(join(this.root,'installation-report.json'),JSON.stringify(this.report,null,2)+'\n');this.publish(8,message,{phase:state,percent:state==='completed'?100:null});}
}

async function cli(){
 const root=process.env.HMT_BUNDLE_ROOT||fileURLToPath(new URL('../',import.meta.url));if(process.platform!=='win32')throw new Error('This installer must run on Windows.');
 const statePath=process.env.HMT_SETUP_STATE||join(root,'.setup','status.json');mkdirSync(dirname(statePath),{recursive:true});
 const notify=data=>{const temp=statePath+'.tmp';writeFileSync(temp,JSON.stringify(data));try{renameSync(temp,statePath);}catch{writeFileSync(statePath,JSON.stringify(data));}};
 const installer=new Installer(root,{notify,mode:process.env.HMT_SETUP_MODE||'install'});
 if(installer.mode==='diagnose-python'){
  const report={schema:1,createdAt:new Date().toISOString(),windowsVersion:release(),nodeArch:process.arch,windowsArch:process.env.PROCESSOR_ARCHITEW6432||process.env.PROCESSOR_ARCHITECTURE,python:installer.python()};
  const file=join(root,'python-diagnostics.json');writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log('Python diagnostics saved: '+file);return;
 }
 await installer.execute();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)cli().catch(error=>{console.error(error.message);process.exitCode=1;});
