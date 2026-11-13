import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateRunCase} from '../ui/run-cases.js';
import {unlockProblemKey} from '../ui/unlock-history.js';
import {createNativeDebugger} from '../ui/native-debugger.js';

test('new run case uses the selected saved page and validates job association',async()=>{
  const source={lessonId:'lesson-a',pageIndex:2},requests=[];
  const api=async(path,body)=>{requests.push([path,body]);return body?{id:'job',status:'queued'}:{status:'completed',result:{...source,input:'4',expected:'1',explanation:'最小偶数'}};};
  const result=await generateRunCase(api,source,'10',{pause:async()=>{}});
  assert.equal(result.input,'4');assert.deepEqual(requests[0][1],{...source,currentInput:'10'});
  for(const wrong of [{...result,lessonId:'other'},{...result,input:'10'}, {...result,expected:null}]){
    await assert.rejects(()=>generateRunCase(async()=>({status:'completed',result:wrong}),source,'10'));
  }
});
test('case failures and page switches reject without returning replacement input',async()=>{
  await assert.rejects(()=>generateRunCase(async()=>({status:'failed',error:{message:'密钥无效'}}),{},'old'),/密钥无效/);
  await assert.rejects(()=>generateRunCase(async()=>({status:'queued'}),{},'old',{isCurrent:()=>false}),/切换/);
});
test('unlock history follows the original problem across regenerated lesson ids',async()=>{
  const original={id:'old',problem:{id:'gesp-original',title:'原题'}};
  assert.equal(await unlockProblemKey(original),await unlockProblemKey({...original,id:'new',problemId:'gesp-original'}));
  assert.notEqual(await unlockProblemKey(original),await unlockProblemKey({problem:{id:'another'}}));
  const p={title:'自编',description:'内容',level:5};
  assert.equal(await unlockProblemKey({id:'old',problem:p}),await unlockProblemKey({id:'new',problem:{...p}}));
});
test('native debug requires upgraded capabilities and cancels pending requests on close',async()=>{
  let listener,disconnected=false,sent=[];
  const port={onMessage:{addListener:fn=>listener=fn},onDisconnect:{addListener:()=>{}},postMessage:v=>{sent.push(v);},disconnect:()=>{disconnected=true;}};
  const bridge=createNativeDebugger(()=>port);
  let pending=bridge.start('int main(){}','');listener({capabilities:['judge']});await assert.rejects(pending,/尚未支持/);assert.ok(disconnected);
  pending=bridge.start('int main(){}','');listener({capabilities:['cppDebugger'],debuggerAvailable:true});await new Promise(r=>setTimeout(r,0));
  assert.equal(sent.at(-1).mode,'debug_start');bridge.close();await assert.rejects(pending,/停止/);
});
