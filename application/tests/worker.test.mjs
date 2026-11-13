import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{summarize} from '../worker/index.js';
const env={ALIBABA_BAILIAN_API_KEY:'test-only-secret',ALIBABA_BAILIAN_MODEL:'qwen3.7-plus'};
const request=(path,body,headers={})=>new Request('https://practice.example/api/stroop/'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const call=async(path,body,config=env)=>{const response=await worker.fetch(request(path,body),config);return {status:response.status,body:await response.json()};};
function wav(seconds=1,silent=false){const b=Buffer.alloc(44+seconds*32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);if(!silent)for(let i=0;i<seconds*16000;i++)b.writeInt16LE(Math.round(Math.sin(i*.1)*3000),44+i*2);return 'data:audio/wav;base64,'+b.toString('base64');}
test('challenge rejects invalid settings; all displayed words conflict with their ink color',async()=>{
 assert.equal((await call('challenge',{duration:1,count:12})).status,400);
 for(const count of [12,24,36]){const {body}=await call('challenge',{duration:60,count});assert.equal(body.items.length,count);assert(body.items.every(x=>x.word!==x.color));assert(body.token);assert(body.id);}
});
test('missing key, cross-origin request and wrong HTTP method are rejected',async()=>{
 assert.equal((await call('challenge',{duration:30,count:12},{})).status,503);
 const cross=await worker.fetch(request('challenge',{duration:30,count:12},{origin:'https://other.example'}),env);assert.equal(cross.status,403);
 assert.equal((await worker.fetch(new Request('https://practice.example/api/stroop/grade'),env)).status,405);
});
test('signed question token cannot be changed; invalid and silent audio never reaches provider',async()=>{
 const {body:s}=await call('challenge',{duration:30,count:12});
 const altered=Buffer.from(JSON.stringify({v:1,items:s.items,duration:120,expires:Date.now()+100000})).toString('base64url')+'.'+s.token.split('.')[1];
 assert.equal((await call('grade',{token:altered,audio:wav(),elapsed:1})).status,400);
 assert.equal((await call('grade',{token:s.token,audio:'data:audio/wav;base64,AAAA',elapsed:1})).status,400);
 assert.equal((await call('grade',{token:s.token,audio:wav(1,true),elapsed:1})).status,400);
 assert.equal((await call('grade',{token:s.token,audio:wav(),elapsed:10})).status,400);
});
test('recording goes through ASR and LLM; counts and scores are checked against signed answers',async t=>{
 const {body:s}=await call('challenge',{duration:30,count:12});
 const answers=s.items.slice(0,3).map(x=>x.color);answers[1]=['红','蓝','绿','黄'].find(x=>x!==s.items[1].color);
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);
  if(body.model==='qwen3-asr-flash')return Response.json({choices:[{message:{content:answers.map(x=>x+'色').join('，')}}]});
  const result=JSON.stringify({answers,feedback:'保持清晰的朗读节奏。'});
  const events=[{choices:[{delta:{reasoning_content:'This must not appear in results.'}}]},...Array.from(result).map(content=>({choices:[{delta:{content}}]}))];
  const bytes=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n');
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}));
 });
 const result=await call('grade',{token:s.token,audio:wav(),elapsed:1});assert.equal(result.status,200);
 assert.equal(calls.length,2);assert.equal(calls[0].model,'qwen3-asr-flash');assert.equal(calls[1].model,'qwen3.7-plus');
 assert.equal(result.body.correct,2);assert.equal(result.body.incorrect,1);assert.equal(result.body.unanswered,9);assert.equal(result.body.score,17);assert.equal(result.body.accuracy,67);assert.equal(result.body.rows.length,12);assert(!JSON.stringify(result.body).includes('test-only-secret'));assert(!JSON.stringify(result.body).includes('This must not'));
});
test('model cannot invent missing colors or inject a fabricated score',async t=>{
 const {body:s}=await call('challenge',{duration:30,count:12});
 t.mock.method(globalThis,'fetch',async(url,options)=>{const body=JSON.parse(options.body);if(body.model==='qwen3-asr-flash')return Response.json({choices:[{message:{content:'红色'}}]});return new Response('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({answers:['红','蓝'],score:100})}}]})+'\n\ndata: [DONE]\n\n');});
 assert.equal((await call('grade',{token:s.token,audio:wav(),elapsed:1})).status,502);
});
test('provider errors are useful and never expose credentials or raw upstream response',async t=>{
 const {body:s}=await call('challenge',{duration:30,count:12});
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'private provider response test-only-secret'}},{status:401}));
 const r=await call('grade',{token:s.token,audio:wav(),elapsed:1});assert.equal(r.status,502);assert.match(r.body.error,/密钥/);assert(!JSON.stringify(r).includes('test-only-secret'));
});
test('extra answers do not raise a perfect score above 100; no answers means zero',()=>{
 const items=[{color:'红',word:'蓝'},{color:'绿',word:'黄'}];
 assert.equal(summarize(items,['红','绿','蓝'],10).score,100);assert.equal(summarize(items,['红','绿','蓝'],10).extra,1);
 const empty=summarize(items,[],10);assert.equal(empty.score,0);assert.equal(empty.unanswered,2);assert.equal(empty.accuracy,0);
});
