import {spawn} from 'node:child_process';
import {copyFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('./',import.meta.url));
const application=join(root,'application');
const task=process.argv[2]||'dev';
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or newer is required. Use the bundled Windows launcher.');
if(!['dev','build','test'].includes(task))throw new Error('Supported tasks: dev, build, test');
if(!existsSync(join(application,'package.json')))throw new Error('The application folder is missing. Extract the complete ZIP first.');

async function run(args,{openBrowser=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:application,env:process.env,stdio:['inherit','pipe','inherit']});
  let opened=false,tail='';
  child.stdout.on('data',chunk=>{
   process.stdout.write(chunk);
   tail=(tail+chunk.toString()).slice(-1000);
   if(openBrowser&&!opened&&tail.includes('Local: http://127.0.0.1:4173')){
    opened=true;
    console.log('[dev] Ready. Keep this window open; press Ctrl+C to stop.');
    if(process.platform==='win32'&&process.env.HMT_NO_BROWSER!=='1'){
     const browser=spawn('powershell.exe',['-NoProfile','-Command',"Start-Process 'http://127.0.0.1:4173'"],{stdio:'ignore',windowsHide:true});
     browser.on('error',()=>console.log('[dev] Open http://127.0.0.1:4173 in your browser.'));
    }
   }
  });
  const interrupt=()=>child.kill('SIGINT');
  process.on('SIGINT',interrupt);
  child.once('error',error=>{process.off('SIGINT',interrupt);reject(error);});
  child.once('exit',(code,signal)=>{process.off('SIGINT',interrupt);resolve(signal==='SIGINT'?0:code??1);});
 });
}

let code=0;
if(task==='dev'){
 const envFile=join(application,'.env'),example=join(application,'.env.example');
 if(!existsSync(envFile)&&existsSync(example)){
  copyFileSync(example,envFile);
  console.log('[config] Created application/.env from the blank example.');
  console.log('[config] Set your API key there to use online AI features.');
 }
 console.log('[dev] Starting bundled application. No npm install or runtime download is required.');
 code=await run([...(existsSync(envFile)?['--env-file='+envFile]:[]),'scripts/dev.mjs'],{openBrowser:true});
}else if(task==='build'){
 console.log('[build] Building application...');
 code=await run(['scripts/build.mjs']);
 if(code===0)code=await run(['scripts/validate-artifact.mjs']);
}else{
 const tests=readdirSync(join(application,'tests')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
 if(!tests.length)throw new Error('No test files found.');
 console.log('[test] Running bundled tests...');
 code=await run(['--test',...tests]);
}
process.exitCode=code;
