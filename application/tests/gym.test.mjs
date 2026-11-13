import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const env={ALIBABA_BAILIAN_API_KEY:'test-only-gym-secret',ALIBABA_BAILIAN_MODEL:'qwen3.7-plus'};
const words=['苹果','雨伞','书包','月亮','杯子','森林','小船','铅笔','花园','火车','蝴蝶','台灯','海豚','草莓','书架','星星','沙发','大树','汽车','帽子','蝴蝶结','白云','石桥','镜子','风筝','西瓜'];
function fixture(prompt){
 if(prompt.includes('倒序数字')){const n=Number(prompt.match(/每串恰好(\d+)位/)[1]);return {sequences:Array.from({length:3},(_,j)=>Array.from({length:n},(_,i)=>(i+j)%10).join(''))};}
 if(prompt.includes('词语记忆')){const n=Number(prompt.match(/生成(\d+)个学习词/)[1]);return {targets:words.slice(0,n),distractors:words.slice(n,n*2)};}
 const count=Number(prompt.match(/生成(\d+)题/)[1]),max=Number(prompt.match(/数值是1–(\d+)/)[1]),rules=prompt.match(/rule只允许([^，]+)/)[1].split('、');
 return {trials:Array.from({length:count},(_,i)=>({value:i%max+1,rule:rules[i%rules.length]}))};
}
function mockModel(t,produce){t.mock.method(globalThis,'fetch',async(url,options)=>{const p=JSON.parse(options.body),data=produce?produce(p):fixture(p.messages[1].content);return new Response('data: '+JSON.stringify({choices:[{delta:{content:typeof data==='string'?data:JSON.stringify(data)}}]})+'\n\ndata: [DONE]\n\n');});}
async function call(path,body,extra={},config=env){const r=await worker.fetch(new Request('https://practice.example/api/gym/'+path,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)}),config);return {status:r.status,body:await r.json()};}
test('all three kinds support every level; memory load rises and response windows shrink',async t=>{
 mockModel(t);const collections={digits:[],words:[],switch:[]};
 for(const kind of Object.keys(collections))for(let level=1;level<=10;level++){
  const result=await call('challenge',{kind,level});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.cfg.level,level);assert.equal(result.body.model,'qwen3.7-plus');assert(result.body.token);collections[kind].push(result.body);
 }
 assert.equal(collections.digits[0].cfg.span,3);assert.equal(collections.digits[9].cfg.span,12);
 assert.equal(collections.words[0].targets.length,4);assert.equal(collections.words[9].targets.length,13);
 assert.equal(collections.words[9].choices.length,26);assert.equal(new Set(collections.words[9].choices).size,26);
 assert.equal(collections.switch[0].cfg.rules.length,1);assert.equal(collections.switch[9].cfg.rules.length,3);
 for(let i=1;i<10;i++){assert(collections.digits[i].cfg.flashMs<collections.digits[i-1].cfg.flashMs);assert(collections.words[i].cfg.studySeconds<=collections.words[i-1].cfg.studySeconds);assert(collections.switch[i].cfg.responseMs<collections.switch[i-1].cfg.responseMs);assert(collections.switch[i].cfg.count>collections.switch[i-1].cfg.count);}
});
test('invalid level, kind, origin and missing configuration are rejected before model calls',async()=>{
 for(const level of [0,11,1.5,null,'1'])assert.equal((await call('challenge',{kind:'digits',level})).status,400);
 assert.equal((await call('challenge',{kind:'unknown',level:1})).status,400);
 assert.equal((await call('challenge',{kind:'words',level:1},{origin:'https://foreign.example'})).status,403);
 assert.equal((await call('challenge',{kind:'digits',level:1},{},{})).status,503);
});
test('invalid model output gets one repair attempt then a useful error',async t=>{
 let attempts=0;mockModel(t,()=>{attempts++;return {sequences:['1']};});
 const r=await call('challenge',{kind:'digits',level:1});assert.equal(r.status,502);assert.equal(attempts,2);assert.match(r.body.error,/本级要求/);
});
test('model repair accepts the corrected payload without changing the requested difficulty',async t=>{
 let n=0;mockModel(t,p=>++n===1?{targets:[],distractors:[]}:fixture(p.messages[1].content));
 const r=await call('challenge',{kind:'words',level:10});assert.equal(r.status,200);assert.equal(r.body.targets.length,13);assert.equal(n,2);
});
test('digits preserve leading zeros and partial answers are graded by position',async t=>{
 mockModel(t,()=>({sequences:['120','345','678']}));const {body:s}=await call('challenge',{kind:'digits',level:1});
 const perfect=await call('grade',{token:s.token,responses:['021','543','876']});assert.equal(perfect.body.score,100);assert.equal(perfect.body.suggestedLevel,2);
 const partial=await call('grade',{token:s.token,responses:['021','500','']});assert.equal(partial.body.correct,4);assert.equal(partial.body.incorrect,2);assert.equal(partial.body.unanswered,3);assert.equal(partial.body.score,44);
 assert.equal((await call('grade',{token:s.token,responses:['021x','','']})).status,400);
});
test('word distractors deduct points; selecting everything is rejected; empty is zero',async t=>{
 mockModel(t);const {body:s}=await call('challenge',{kind:'words',level:1});
 const r=await call('grade',{token:s.token,responses:[...s.targets.slice(0,3),s.distractors[0]]});assert.equal(r.body.correct,3);assert.equal(r.body.incorrect,1);assert.equal(r.body.unanswered,1);assert.equal(r.body.score,50);
 assert.equal((await call('grade',{token:s.token,responses:s.choices})).status,400);
 assert.equal((await call('grade',{token:s.token,responses:[s.targets[0],s.targets[0]]})).status,400);
 assert.equal((await call('grade',{token:s.token,responses:[]})).body.score,0);
});
test('rule answers are derived from numbers and rule types; late answers never get credit',async t=>{
 mockModel(t);const {body:s}=await call('challenge',{kind:'switch',level:10});
 const answers=s.trials.map(t=>({answer:t.rule==='parity'?(t.value%2?0:1):t.rule==='magnitude'?(t.value>s.cfg.threshold?0:1):(t.value%3===0?0:1),ms:100}));
 const full=await call('grade',{token:s.token,responses:answers});assert.equal(full.body.score,100);assert.equal(full.body.suggestedLevel,10);
 answers[0].ms=s.cfg.responseMs+1;const late=await call('grade',{token:s.token,responses:answers});assert.equal(late.body.unanswered,1);assert.equal(late.body.correct,s.cfg.count-1);
});
test('grading rejects altered tokens and cannot be tricked by a supplied score',async t=>{
 mockModel(t);const {body:s}=await call('challenge',{kind:'digits',level:1});const [data,sig]=s.token.split('.'),payload=JSON.parse(Buffer.from(data,'base64url'));payload.cfg.level=10;
 assert.equal((await call('grade',{token:Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+sig,responses:['','','']})).status,400);
 const zero=await call('grade',{token:s.token,responses:['','',''],score:100});assert.equal(zero.body.score,0);assert(!JSON.stringify(zero).includes('test-only-gym-secret'));
});
