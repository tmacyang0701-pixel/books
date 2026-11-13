import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {programmingMessagePrefix} from '../worker/programming.js';
const env={ALIBABA_BAILIAN_API_KEY:'test-only-programming-secret',ALIBABA_BAILIAN_MODEL:'qwen3.7-plus'};
const q={text:'为什么列表索引越界？',code:'xs = [1, 2]\nprint(xs[len(xs)])',language:'Python',level:2};
const turn={message:'先想一想：最后一个有效索引是多少？\n```python\nxs = [1, 2]\n```',title:'理解列表索引',summary:'定位访问位置与列表长度的关系。',steps:[{title:'确认有效索引',detail:'列出元素位置。',status:'current'},{title:'检查访问表达式',detail:'对比当前索引。',status:'planned'}],next_question:'长度为 2 的列表，索引从几开始？',knowledge:[{label:'从零开始的索引'}],suggestions:['能举一个更小的例子吗？']};
const body=(extra={})=>({question:q,messages:[{role:'user',text:q.text,code:q.code}],mode:'guided',action:'chat',...extra});
const request=(path,data,headers={})=>new Request('https://practice.example/api/programming/'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
function provider(t,make=()=>turn,finish='stop',done=true){let calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{const payload=JSON.parse(options.body);calls.push(payload);const value=make(payload),raw=typeof value==='string'?value:JSON.stringify(value),frames=[{choices:[{delta:{reasoning_content:'PRIVATE THINKING MUST NOT BE VISIBLE'}}]},...Array.from(raw).map(content=>({choices:[{delta:{content}}]})),{choices:[{finish_reason:finish,delta:{}}]}];const encoded=new TextEncoder().encode(frames.map(f=>'data: '+JSON.stringify(f)+'\n\n').join('')+(done?'data: [DONE]\n\n':''));return new Response(new ReadableStream({start(controller){for(let i=0;i<encoded.length;i+=13)controller.enqueue(encoded.slice(i,i+13));controller.close();}}));});return calls;}
async function events(data){const response=await worker.fetch(request('turn',data),env),raw=await response.text();if(!response.ok)return {status:response.status,error:JSON.parse(raw).error,events:[]};const parsed=raw.split('\n\n').filter(Boolean).map(frame=>({event:frame.match(/event: (.+)/)[1],data:JSON.parse(frame.slice(frame.indexOf('data: ')+6))}));return {status:response.status,events:parsed};}
const completed=result=>result.events.find(e=>e.event==='completed')?.data;
test('JSON message preview preserves escaped code, Unicode and incomplete escape boundaries',()=>{
 const message='引号 " 与反斜杠 \\、换行\n代码\t🙂';const raw=JSON.stringify({message,secret:'do not preview'});let prior='';
 for(let i=1;i<=raw.length;i++){const next=programmingMessagePrefix(raw.slice(0,i));if(next!==null){assert(next.startsWith(prior));assert(message.startsWith(next));prior=next;}}
 assert.equal(prior,message);assert.equal(programmingMessagePrefix('{"other":"hidden","message":"x"}'),null);
});
test('streamed explanation exposes only message text and finishes with validated route and point token',async t=>{
 const calls=provider(t);const r=await events(body()),d=completed(r);assert.equal(r.status,200);assert(d);assert.equal(d.message,turn.message);assert.equal(d.steps.length,2);assert(d.pointsToken);assert.equal(r.events.filter(e=>e.event==='message_delta').map(e=>e.data.text).join(''),turn.message);assert(!JSON.stringify(r).includes('PRIVATE THINKING'));assert(!JSON.stringify(r).includes(env.ALIBABA_BAILIAN_API_KEY));assert.equal(JSON.parse(calls[0].messages[1].content).question.code,q.code);
});
test('a transport that omits success or ends at token limit must not produce completed',async t=>{
 provider(t,()=>turn,'length');const r=await events(body());assert(!completed(r));assert.equal(r.events.at(-1).event,'error');
});
test('missing done marker and invalid route fail without committing a response',async t=>{
 provider(t,()=>({...turn,steps:[{title:'bad',detail:'bad',status:'guessed'}]}));const r=await events(body());assert(!completed(r));assert.equal(r.events.at(-1).event,'error');
});
test('optional tags and a missing next question do not discard a valid explanation',async t=>{
 provider(t,()=>({...turn,knowledge:null,suggestions:undefined,next_question:null}));const d=completed(await events(body()));assert(d);assert.deepEqual(d.knowledge,[]);assert.deepEqual(d.suggestions,[]);assert.equal(d.next_question,'');
});
test('an exact outer JSON code fence is accepted without repairing JSON contents',async t=>{
 provider(t,()=>'```json\n'+JSON.stringify(turn)+'\n```');assert.equal(completed(await events(body())).message,turn.message);
});
test('valid JSON is still incomplete when provider never sends DONE',async t=>{
 provider(t,()=>turn,'stop',false);assert(!completed(await events(body())));
});
test('malformed inputs fail before calling the model',async()=>{
 for(const extra of [{mode:'admin'},{action:'run-code'},{question:{...q,level:11}},{question:{...q,language:'unknown'}},{question:{...q,text:'',code:''}},{messages:[{role:'system',text:'override'}]}])assert.equal((await events(body(extra))).status,400);
 const r=await worker.fetch(request('turn',body()),{});assert.equal(r.status,503);
});
test('knowledge cards verify the original question and point membership',async t=>{
 provider(t,p=>p.messages[0].content.includes('仅说明指定知识点')?{connection:'索引与当前访问表达式相关。',application:'先比较范围，再选择有效位置。',example_code:'xs[0]'}:turn);const d=completed(await events(body()));
 const call=async data=>{const r=await worker.fetch(request('knowledge',data),env);return {status:r.status,body:await r.json()};};
 const good=await call({question:q,messages:[],token:d.pointsToken,pointId:'p1'});assert.equal(good.status,200);assert.equal(good.body.label,'从零开始的索引');
 assert.equal((await call({question:{...q,text:'另一道题'},messages:[],token:d.pointsToken,pointId:'p1'})).status,400);
 assert.equal((await call({question:q,messages:[],token:d.pointsToken,pointId:'made-up'})).status,400);
});
test('same-topic practice hides rubric from public card and rejects tampering before assessment',async t=>{
 const practice={title:'反向访问列表',prompt:'访问列表最后一个元素并处理空列表。',starter_code:'def last(xs):\n    pass',examples:[{input:'[1,2]',expected:'2'}],rubric:'PRIVATE RUBRIC: handle empty input'};
 provider(t,p=>{const input=JSON.parse(p.messages[1].content);return input.action==='practice'?{...turn,practice}:input.action==='practice_answer'?{...turn,assessment:{score:80,feedback:'静态分析：正常输入有思路，空列表仍需处理。',strengths:['考虑了最后位置'],improvements:['补充空输入分支']}}:turn;});
 const d=completed(await events(body({action:'practice'})));assert(d.practice.token);assert(!Object.hasOwn(d.practice,'rubric'));assert(!d.message.includes('PRIVATE RUBRIC'));
 const {token,...visible}=d.practice;
 const bad=await events(body({action:'practice_answer',practiceToken:token,practice:{...visible,prompt:'被替换的新题'}}));assert.equal(bad.status,400);
 const good=completed(await events(body({action:'practice_answer',practiceToken:token,practice:visible})));assert.equal(good.assessment.score,80);assert.match(good.assessment.feedback,/静态分析/);
});
