import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Installer,atLeast,nativeHost} from '../setup/engine.mjs';

function fixture(t,options={}){
 const root=mkdtempSync(join(tmpdir(),'数间 setup test '));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const dir of ['application','python','devcpp','.setup','profile/Embarcadero/Dev-Cpp'])mkdirSync(join(root,dir),{recursive:true});
 writeFileSync(join(root,'application','.env.example'),'KEY=\n');writeFileSync(join(root,'application','.env'),'KEY=keep-local-secret\n');
 const artifact=Buffer.from('fixture installer bytes'),sha256=createHash('sha256').update(artifact).digest('hex');
 writeFileSync(join(root,'python','fixture.exe'),artifact);writeFileSync(join(root,'python','downloads.json'),JSON.stringify({files:[{filename:'fixture.exe',sha256}]}));
 writeFileSync(join(root,'devcpp','fixture.exe'),artifact);writeFileSync(join(root,'devcpp','downloads.json'),JSON.stringify({assetName:'fixture.exe',sha256}));
 const binaries=new Map(),calls=[],states=[],oldNode=join(root,'existing Node','node.exe'),oldPython=join(root,'existing Python','python.exe'),oldDev=join(root,'existing Dev');
 const good={status:0,stdout:'',stderr:''};
 const addNode=(path,version='22.23.5')=>binaries.set(path,{type:'node',version});
 const addPython=(path,version=[3,12,1],pip=true,stdlib=true)=>binaries.set(path,{type:'python',version,pip,stdlib});
 function addDev(home,{missing='',version='9.2.0'}={}){binaries.set(join(home,'devcpp.exe'),{type:'ide'});for(const file of ['gcc.exe','g++.exe','gdb.exe','mingw32-make.exe'])if(file!==missing)binaries.set(join(home,'TDM-GCC-64','bin',file),{type:'tool',version});}
 addNode(oldNode,options.nodeVersion||'22.23.5');
 if(!options.noPython)addPython(oldPython,options.pythonVersion||[3,12,1],options.pip!==false,options.stdlib!==false);
 if(!options.noDev)addDev(oldDev,{missing:options.missingTool,version:options.gccVersion||'9.2.0'});
 let failedExisting=false;
 const host={env:{PATH:'',APPDATA:join(root,'profile')},powershell:'powershell.exe',exists:path=>binaries.has(path)||existsSync(path),where:name=>name==='node.exe'?[oldNode]:name==='python.exe'?[...(options.storeAlias?[options.storeAlias]:[]),oldPython]:[],pythonRegistry:()=>[],localPython:()=>[],devRegistry:()=>[oldDev],fileVersion:()=> '6.3',
 probe(path,args){calls.push({kind:'probe',path,args});const b=binaries.get(path);if(!b)return {status:1,stdout:'',stderr:'missing'};if(b.type==='node')return {...good,stdout:JSON.stringify({version:b.version,arch:'x64'})};if(b.type==='python')return {...good,stdout:JSON.stringify({version:b.version,pip:b.pip,stdlib:b.stdlib})};if(b.type==='tool')return {...good,stdout:b.version};return good;},
 async run(path,args,env){calls.push({kind:'run',path,args,env});
  if(path===join(root,'python','fixture.exe')){addPython(join(root,'runtime','python-full','python.exe'));return {...good,status:options.pythonExit||0};}
  if(path==='powershell.exe'&&args.some(a=>a.endsWith('install-devcpp-elevated.ps1'))){
   if(options.denyUAC)return {status:1,stderr:'denied'};
   addDev(env.HMT_DEVCPP_TARGET);
   if(options.replaceConfig)writeFileSync(join(root,'profile','Embarcadero','Dev-Cpp','devcpp.cfg'),'new defaults');
  }
  if(['gcc.exe','g++.exe'].includes(basename(path))){
   if(options.brokenCompiler||options.brokenExisting&&path.startsWith(oldDev)){failedExisting=true;return {status:1,stderr:'missing standard headers'};}
  }
  if(options.requestCancel&&basename(path)==='python.exe')writeFileSync(join(root,'.setup','cancel'),'stop');
  if(basename(path)==='check-c.exe')return {...good,stdout:'C_OK'};
  if(basename(path)==='check-cpp.exe')return {...good,stdout:'6'};
  return good;
 }};
 const installer=new Installer(root,{host,bootstrapNode:oldNode,mode:options.mode||'install',notify:s=>states.push(structuredClone(s))});
 return {root,installer,host,calls,states,binaries,oldNode,oldPython,oldDev,addNode,addPython,addDev,get failedExisting(){return failedExisting;}};
}
const nativeInstallCalls=f=>f.calls.filter(c=>c.kind==='run'&&(c.path.endsWith('fixture.exe')||c.args.some(a=>a.endsWith('install-devcpp-elevated.ps1'))));

test('version policy distinguishes old versions',()=>{assert.equal(atLeast('20.19.0',[22]),false);assert.equal(atLeast('22.23.5',[22]),true);assert.equal(atLeast('3.9.9',[3,11]),false);assert.equal(atLeast('3.14.10',[3,11]),true);});
test('all adequate existing environments are reused and config is preserved',async t=>{
 const f=fixture(t);const report=await f.installer.execute();assert.equal(report.success,true);assert.equal(nativeInstallCalls(f).length,0);assert.deepEqual(report.actions.map(x=>x.action),['skipped','skipped','skipped']);
 const selected=JSON.parse(readFileSync(join(f.root,'runtime-selection.json')));assert.equal(selected.node,f.oldNode);assert.equal(selected.python,f.oldPython);assert.equal(selected.devCppHome,f.oldDev);assert.equal(readFileSync(join(f.root,'application','.env'),'utf8'),'KEY=keep-local-secret\n');assert.equal(f.states.at(-1).state,'completed');assert.equal(f.states.at(-1).completedSteps,8);
});
test('detection only never starts installers or changes runtime selection',async t=>{
 const f=fixture(t,{noPython:true,noDev:true,mode:'detect'});const r=await f.installer.execute();assert.equal(r.allReady,false);assert.equal(nativeInstallCalls(f).length,0);assert.equal(existsSync(join(f.root,'runtime-selection.json')),false);assert.equal(f.states.at(-1).state,'detected');assert.equal(r.components.devCpp.ready,false);
});
test('old Node is rejected even when executable exists',t=>{const f=fixture(t,{nodeVersion:'20.19.0'});assert.equal(f.installer.node().ready,false);});
for(const [name,options]of [['old Python',{pythonVersion:[3,8,9]}],['missing pip',{pip:false}],['broken standard library',{stdlib:false}]]){
 test(name+' is replaced by an independent offline Python',async t=>{const f=fixture(t,options);await f.installer.execute();const calls=nativeInstallCalls(f);assert.equal(calls.length,1);assert.equal(calls[0].path,join(f.root,'python','fixture.exe'));assert.ok(calls[0].args.includes('/quiet'));assert.ok(calls[0].args.includes('PrependPath=0'));assert.ok(calls[0].args.includes('Include_launcher=0'));assert.ok(calls[0].args.includes('TargetDir='+join(f.root,'runtime','python-full')));assert.ok(f.binaries.has(f.oldPython));});
}
test('Windows Store python alias is never launched',t=>{const alias='C:\\Users\\Tester\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe';const f=fixture(t,{storeAlias:alias});f.addPython(alias);assert.equal(f.installer.python().path,f.oldPython);assert.ok(!f.calls.some(c=>c.path===alias));});
for(const missingTool of ['gcc.exe','g++.exe','gdb.exe','mingw32-make.exe'])test('missing '+missingTool+' triggers complete offline component install',async t=>{
 const f=fixture(t,{missingTool});assert.equal(f.installer.devCpp().ready,false);const r=await f.installer.execute();assert.equal(r.success,true);const calls=nativeInstallCalls(f);assert.equal(calls.length,1);assert.equal(calls[0].env.HMT_DEVCPP_TARGET,join(f.root,'runtime','Dev-Cpp'));assert.ok(f.binaries.has(join(f.oldDev,'devcpp.exe')));
});
test('GCC below required version is not accepted',t=>{const f=fixture(t,{gccVersion:'4.9.2'});assert.equal(f.installer.devCpp().ready,false);});
test('existing toolchain with broken headers is replaced',async t=>{const f=fixture(t,{brokenExisting:true});const r=await f.installer.execute();assert.equal(f.failedExisting,true);assert.equal(nativeInstallCalls(f).length,1);assert.equal(r.success,true);assert.equal(r.selection.devCppHome,join(f.root,'runtime','Dev-Cpp'));});
test('corrupt Python artifact fails before running installer',async t=>{const f=fixture(t,{noPython:true});writeFileSync(join(f.root,'python','fixture.exe'),'corrupt');await assert.rejects(f.installer.execute(),/校验失败/);assert.equal(nativeInstallCalls(f).length,0);assert.equal(f.states.at(-1).state,'failed');});
test('denied Dev-C++ elevation yields failure and a report',async t=>{const f=fixture(t,{noDev:true,denyUAC:true});await assert.rejects(f.installer.execute(),/授权/);assert.equal(JSON.parse(readFileSync(join(f.root,'installation-report.json'))).success,false);assert.equal(f.states.at(-1).state,'failed');});
test('old Dev-C++ config survives installers replacing defaults',async t=>{const f=fixture(t,{noDev:true,replaceConfig:true});const cfg=join(f.root,'profile','Embarcadero','Dev-Cpp','devcpp.cfg');writeFileSync(cfg,'original user settings');await f.installer.execute();assert.equal(readFileSync(cfg,'utf8'),'original user settings');});
test('cancellation is recorded and no installer is started',async t=>{const f=fixture(t,{noPython:true,noDev:true});writeFileSync(join(f.root,'.setup','cancel'),'stop');await f.installer.execute();assert.equal(nativeInstallCalls(f).length,0);assert.equal(f.states.at(-1).state,'cancelled');});
test('request during an installation prevents the next install',async t=>{const f=fixture(t,{noPython:true,noDev:true});const original=f.host.run.bind(f.host);f.host.run=async(path,args,env)=>{const r=await original(path,args,env);if(path===join(f.root,'python','fixture.exe'))writeFileSync(join(f.root,'.setup','cancel'),'stop');return r;};await f.installer.execute();assert.equal(nativeInstallCalls(f).length,1);assert.equal(f.states.at(-1).state,'cancelled');});
test('rerun uses prior successful choices and skips repeated installation',async t=>{const f=fixture(t,{noPython:true,noDev:true});await f.installer.execute();assert.equal(nativeInstallCalls(f).length,2);const again=new Installer(f.root,{host:f.host,bootstrapNode:f.oldNode});await again.execute();assert.equal(nativeInstallCalls(f).length,2);});
test('compiler failure after installation never reports success',async t=>{const f=fixture(t,{noDev:true,brokenCompiler:true});await assert.rejects(f.installer.execute(),/编译检查失败/);assert.equal(f.states.at(-1).state,'failed');assert.equal(existsSync(join(f.root,'runtime-selection.json')),false);});
test('native environment merge replaces duplicate case variants of PATH',()=>{const host=nativeHost('',{...process.env,Path:'old-value'});const r=host.probe(process.execPath,['-p',"JSON.stringify(Object.entries(process.env).filter(([key])=>key.toLowerCase()==='path'))"],{PATH:'new-value'});assert.equal(r.status,0);const entries=JSON.parse(r.stdout);assert.equal(entries.length,1);assert.equal(entries[0][0].toLowerCase(),'path');assert.equal(entries[0][1],'new-value');});

test('missing registered bundle Python is repaired before MODIFY can uninstall its test suite',async t=>{
 const f=fixture(t,{noPython:true}),old=join(f.root,'old bundle','runtime','python-full','python.exe');
 f.host.pythonRegistry=()=>[old];
 const run=f.host.run.bind(f.host);
 f.host.run=async(path,args,env)=>{
  if(path.endsWith('fixture.exe')){
   f.calls.push({kind:'run',path,args});
   if(!args.includes('/repair'))return {status:1603,stderr:'test_JustForMe: 0x80070643'};
   f.addPython(old,[3,14,10]);return {status:0,stdout:'',stderr:''};
  }
  return run(path,args,env);
 };
 const report=await f.installer.execute(),calls=nativeInstallCalls(f);
 assert.equal(report.success,true);assert.equal(report.selection.python,old);
 assert.equal(calls.length,1);assert.ok(calls[0].args.includes('/repair'));
 assert.ok(!calls[0].args.some(a=>a.startsWith('TargetDir=')||a.startsWith('Include_')));
});

test('failed repair stops without attempting MODIFY or writing runtime selection',async t=>{
 const f=fixture(t,{noPython:true});f.host.pythonRegistry=()=>[join(f.root,'old','runtime','python-full','python.exe')];
 f.host.run=async(path,args)=>{f.calls.push({kind:'run',path,args});return {status:1603,stderr:'repair failed'};};
 await assert.rejects(f.installer.execute(),/旧安装修复失败/);
 assert.equal(nativeInstallCalls(f).length,1);assert.ok(nativeInstallCalls(f)[0].args.includes('/repair'));
 assert.equal(existsSync(join(f.root,'runtime-selection.json')),false);
});

test('a repair that restores no runtime is not treated as success',async t=>{
 const f=fixture(t,{noPython:true});f.host.pythonRegistry=()=>[join(f.root,'old','runtime','python-full','python.exe')];
 f.host.run=async(path,args)=>{f.calls.push({kind:'run',path,args});return {status:0,stdout:'',stderr:''};};
 await assert.rejects(f.installer.execute(),/安装后检查失败/);
 assert.equal(nativeInstallCalls(f).length,1);assert.equal(existsSync(join(f.root,'runtime-selection.json')),false);
});
