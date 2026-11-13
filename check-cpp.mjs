import {existsSync,mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if(process.platform!=='win32')throw new Error('Run this check on Windows after installing the bundled Dev-C++.');
const root=fileURLToPath(new URL('./',import.meta.url));
let selected={};try{selected=JSON.parse(readFileSync(join(root,'runtime-selection.json'),'utf8'));}catch{}
const locations=[
 selected.devCppHome,
 process.env.DEVCPP_HOME,
 join(root,'runtime','Dev-Cpp'),
 ...[process.env['ProgramFiles(x86)'],process.env.ProgramFiles].filter(Boolean).flatMap(base=>[join(base,'Embarcadero','Dev-Cpp'),join(base,'Dev-Cpp')]),
].filter(Boolean);
const home=locations.find(dir=>existsSync(join(dir,'devcpp.exe'))&&['TDM-GCC-64','MinGW64','MinGW','MinGW32'].some(folder=>existsSync(join(dir,folder,'bin','g++.exe'))));
if(!home)throw new Error('Dev-C++ compiler not found. Install the Full package first. For a custom directory, set DEVCPP_HOME to the Dev-Cpp folder.');
const bin=selected.devCppHome===home&&selected.cppBin?selected.cppBin:['TDM-GCC-64','MinGW64','MinGW','MinGW32'].map(folder=>join(home,folder,'bin')).find(dir=>existsSync(join(dir,'g++.exe')));
const env={...process.env,PATH:bin+delimiter+(process.env.PATH||'')};
function run(executable,args){
 const result=spawnSync(executable,args,{env,encoding:'utf8',timeout:30000,windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error((result.stderr||result.stdout||'Tool failed').trim());
 return result.stdout.trim();
}
console.log('Dev-C++ directory: '+home);
for(const tool of ['gcc.exe','g++.exe','gdb.exe','mingw32-make.exe']){
 const executable=join(bin,tool);
 if(!existsSync(executable))throw new Error('Missing standard component: '+tool);
 console.log('[OK] '+tool+': '+run(executable,['--version']).split('\n')[0]);
}
const directory=mkdtempSync(join(tmpdir(),'hmt-cpp-check-'));
try{
 const cpp=join(directory,'check.cpp'),cppExe=join(directory,'check-cpp.exe');
 writeFileSync(cpp,'#include <iostream>\n#include <vector>\n#include <numeric>\nint main(){std::vector<int> v{1,2,3};std::cout << std::accumulate(v.begin(),v.end(),0);}\n');
 run(join(bin,'g++.exe'),['-std=c++17',cpp,'-o',cppExe]);
 if(run(cppExe,[])!=='6')throw new Error('C++ program returned an unexpected result.');
 console.log('[OK] C++17 compilation, linking, standard headers and runtime');
 const c=join(directory,'check.c'),cExe=join(directory,'check-c.exe');
 writeFileSync(c,'#include <stdio.h>\nint main(void){printf("C_OK");return 0;}\n');
 run(join(bin,'gcc.exe'),['-std=c11',c,'-o',cExe]);
 if(run(cExe,[])!=='C_OK')throw new Error('C program returned an unexpected result.');
 console.log('[OK] C11 compilation, linking and runtime');
 console.log('All installed C/C++ component checks passed.');
}finally{rmSync(directory,{recursive:true,force:true});}
