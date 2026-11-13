import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCode,analysisProgress,attemptOutcome,codeHash,analysisDayStart} from '../ui/analysis-policy.js';
import {requestCodeAnalysis,annotatedCodeHtml} from '../ui/code-analysis.js';
const now=10_000_000,hash=i=>i.toString(16).padStart(64,'0');
const events=Array.from({length:6},(_,i)=>({hash:hash(i+1),at:now-900000+i*180000,status:'WA',mode:'judge'}));
test('six distinct failed modifications over 15 minutes unlock; both thresholds required',()=>{
 assert.equal(analysisProgress({events},now).eligible,true);
 assert.equal(analysisProgress({events:events.slice(1)},now).eligible,false);
 assert.equal(analysisProgress({events:events.map((e,i)=>({...e,at:now-500000+i*100000}))},now).eligible,false);
 assert.equal(analysisProgress({baseline:events[0].hash,events},now).count,5);
});
test('expiry, repeated runs and a passing submission do not unlock',()=>{
 assert.equal(analysisProgress({events},now+3600001).eligible,true);
 assert.equal(analysisProgress({events},analysisDayStart(now)+86400000).count,0);
 assert.equal(analysisProgress({events:events.map(e=>({...e,hash:hash(1)}))},now).count,1);
 const pass={hash:hash(20),at:now+1,status:'AC',mode:'judge'};
 assert.equal(analysisProgress({events:[...events,pass]},now+1).count,0);
 assert.equal(analysisProgress({events:[...events,{...pass,status:'OK'}]},now+1).eligible,false);
 assert.equal(analysisProgress({events:events.map(e=>({...e,at:e.at+1000000}))},now).count,0);
});
test('comment/layout edits are ignored while literals and operators remain significant',()=>{
 assert.equal(canonicalCode('int a=1; // note\n a++;'),canonicalCode('int /*x*/ a = 1; a ++ ;'));
 assert.notEqual(canonicalCode('a++'),canonicalCode('a + +'));
 assert.notEqual(canonicalCode('"a b"'),canonicalCode('"ab"'));
 assert.notEqual(canonicalCode('R"tag(// a)tag"'),canonicalCode('R"tag(// b)tag"'));
 assert.notEqual(canonicalCode('int a=1;'),canonicalCode('int a=2;'));
});
test('only submitted assessments count; runs and unknown failures do not',()=>{
 for(const status of ['OK','AC','WA','PARTIAL','CE','RE','TLE'])assert.equal(attemptOutcome({status},'run'),null);
 for(const status of ['AC','WA','PARTIAL','CE','RE','TLE'])assert.equal(attemptOutcome({status},'judge'),status);
 assert.equal(attemptOutcome({status:'OK'},'judge'),null);
 assert.equal(attemptOutcome({error:'host disconnected'},'judge'),null);
});
test('run-only and untagged legacy history cannot unlock or reset submitted failures',()=>{
 assert.equal(analysisProgress({events:events.map(e=>({...e,mode:'run'}))},now).count,0);
 assert.equal(analysisProgress({events:events.map(({mode,...e})=>e)},now).count,0);
 const runPass={hash:hash(20),at:now+1,status:'AC',mode:'run'};
 assert.equal(analysisProgress({events:[...events,runPass]},now+1).eligible,true);
 assert.equal(analysisProgress({events:[...events,{...runPass,mode:'judge'}]},now+1).eligible,false);
});
test('review result must match the exact code snapshot and valid line ranges',async()=>{
 const snapshot={problem:{id:'p'},code:'int main(){\nreturn 0;\n}',input:''};
 const result={problemId:'p',sourceHash:await codeHash(snapshot.code),summary:'ok',issues:[]};
 assert.equal((await requestCodeAnalysis(async()=>({status:'completed',result}),snapshot,{})).summary,'ok');
 for(const bad of [{sourceHash:'other'},{problemId:'other'},{issues:[{line:4,endLine:4,severity:'error',title:'x',reason:'x',suggestion:'x'}]}])await assert.rejects(requestCodeAnalysis(async()=>({status:'completed',result:{...result,...bad}}),snapshot,{}));
 const html=annotatedCodeHtml('<script>x</script>',[{line:1,endLine:1,severity:'error',title:'<img src=x>'}]);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('review-line error'));
});

test('daily window uses local calendar midnight, including attempts older than one hour',()=>{const noon=new Date(2026,10,12,12).getTime();const morning=events.map((e,i)=>({...e,at:noon-10800000+i*180000}));assert.equal(analysisProgress({events:morning},noon).eligible,true);assert.equal(analysisProgress({events:morning},new Date(2026,10,13,0,0,1).getTime()).count,0);});
test('configured thresholds override defaults without changing failure history',()=>{assert.equal(analysisProgress({events},now,{dailyMinutes:20,failedChanges:8}).eligible,false);assert.equal(analysisProgress({events},now,{dailyMinutes:10,failedChanges:4}).eligible,true);});
test('countdown advances without another run; a single-failure policy can unlock',()=>{
 const noon=new Date(2026,10,12,12).getTime(),record={events:[{hash:hash(1),status:'PARTIAL',mode:'judge',at:noon}]},policy={dailyMinutes:1,failedChanges:1};
 assert.equal(analysisProgress(record,noon+59000,policy).remainingMs,1000);
 assert.equal(analysisProgress(record,noon+59000,policy).eligible,false);
 assert.equal(analysisProgress(record,noon+60000,policy).eligible,true);
 assert.equal(analysisProgress(record,noon+120000,policy).remainingMs,0);
 assert.equal(analysisProgress(record,noon+120000,{...policy,failedChanges:2}).eligible,false);
 const tomorrow=analysisProgress(record,new Date(2026,10,13,0).getTime(),policy);
 assert.equal(tomorrow.count,0);assert.equal(tomorrow.remainingMs,60000);assert.equal(tomorrow.eligible,false);
});
