import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChatSessions,pageChatKey,chatContextMessages} from '../ui/chat-sessions.js';
import {chatContent} from '../ui/chat-panel.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const flush=()=>new Promise(r=>setImmediate(r));
function storage(){const data=new Map();return {data,async get(k){return structuredClone(data.get(k));},async put(v){data.set(v.key,structuredClone(v));},async deleteLesson(id){for(const key of data.keys())if(key.startsWith(id+':'))data.delete(key);}};}
const result=(lessonId,pageIndex,answer)=>({status:'completed',result:{lessonId,pageIndex,answer}});

test('late answer stays on its original page while another page sends a question',async()=>{
  const store=storage(),wait=deferred(),requests=[];
  const api=async(path,body)=>{if(body){requests.push(body);return {id:'job-'+body.pageIndex};}return path.endsWith('0')?wait.promise:result('lesson',1,'第二页的回答');};
  const sessions=new ChatSessions({store,api});
  const a=await sessions.load('lesson',0),b=await sessions.load('lesson',1);
  const first=sessions.send(a.key,'第一页的问题');await flush();
  await sessions.send(b.key,'第二页的问题');
  assert.equal(b.messages.at(-1).content,'第二页的回答');
  wait.resolve(result('lesson',0,'第一页的回答'));await first;
  assert.equal(a.messages.at(-1).content,'第一页的回答');
  assert.equal(store.data.get(b.key).messages.length,2);
  assert.deepEqual(requests[1].messages,[{role:'user',content:'第二页的问题'}]);
  assert.notEqual(pageChatKey('other',0),a.key);
});

test('refresh resumes a saved task without creating a duplicate question',async()=>{
  const store=storage();
  const key=pageChatKey('lesson',2);
  await store.put({key,lessonId:'lesson',pageIndex:2,draft:'',messages:[{id:'u',role:'user',content:'为什么？',status:'complete'},{id:'a',role:'assistant',content:'',status:'pending'}],pending:{messageId:'a',jobId:'existing'}});
  const paths=[];
  const sessions=new ChatSessions({store,api:async(path,body)=>{paths.push(path);assert.equal(body,undefined);return result('lesson',2,'恢复后的回答');}});
  const record=await sessions.load('lesson',2);await sessions.running.get(key);
  assert.deepEqual(paths,['/api/jobs/existing']);assert.equal(record.messages.length,2);
  assert.equal(record.messages.at(-1).content,'恢复后的回答');assert.equal(record.pending,null);
});

test('failed answer retries the same question without duplicating user messages',async()=>{
  const store=storage();let attempt=0;
  const sessions=new ChatSessions({store,api:async(path,body)=>body?{id:String(++attempt)}:attempt===1?{status:'failed',error:{message:'暂时不可用'}}:result('lesson',0,'已重试')});
  const record=await sessions.load('lesson',0);await sessions.send(record.key,'请解释');
  assert.equal(record.messages.at(-1).status,'error');await sessions.retry(record.key);
  assert.equal(record.messages.length,2);assert.equal(record.messages.at(-1).content,'已重试');
});

test('clearing one page leaves another page and another lesson intact',async()=>{
  const store=storage(),api=async()=>{};
  const sessions=new ChatSessions({store,api});
  const a=await sessions.load('lesson',0),b=await sessions.load('lesson',1),c=await sessions.load('second',0);
  await sessions.draft(a.key,'a');await sessions.draft(b.key,'b');await sessions.draft(c.key,'c');await sessions.clear(a.key);
  const reloaded=new ChatSessions({store,api});
  assert.equal((await reloaded.load('lesson',0)).draft,'');assert.equal((await reloaded.load('lesson',1)).draft,'b');assert.equal((await reloaded.load('second',0)).draft,'c');
});

test('storage failure prevents sending an unpersisted question',async()=>{
  let calls=0;
  const sessions=new ChatSessions({store:{async get(){},async put(){throw Error('quota');}},api:async()=>{calls++;}});
  const record=await sessions.load('lesson',0);await sessions.send(record.key,'不能丢失的问题');
  assert.equal(calls,0);assert.equal(record.messages.at(-1).status,'error');assert.ok(record.storageError);
});

test('response for the wrong page is rejected',async()=>{
  const sessions=new ChatSessions({store:storage(),api:async(path,body)=>body?{id:'job'}:result('lesson',7,'不属于这一页')});
  const record=await sessions.load('lesson',0);await sessions.send(record.key,'请解释');
  assert.equal(record.messages.at(-1).status,'error');assert.equal(record.messages.at(-1).content,'');
});

test('late answer cannot recreate chat history after a lesson is deleted',async()=>{
  const store=storage(),pending=deferred();
  const sessions=new ChatSessions({store,api:async(path,body)=>body?{id:'job'}:pending.promise});
  const record=await sessions.load('lesson',0);const running=sessions.send(record.key,'问题');await flush();
  await sessions.removeLesson('lesson');pending.resolve(result('lesson',0,'迟到的回答'));await running;
  assert.equal(store.data.size,0);assert.equal(sessions.records.size,0);
});

test('only bounded complete messages go to the model',()=>{
  const messages=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'a'.repeat(3000),status:'complete'}));
  messages.push({role:'user',content:'最后一个问题',status:'complete'},{role:'assistant',content:'错误消息',status:'error'});
  const context=chatContextMessages(messages);
  assert.ok(context.length<=20);assert.ok(context.reduce((n,m)=>n+m.content.length,0)<=24000);assert.equal(context.at(-1).content,'最后一个问题');
});

test('chat formatting escapes HTML and preserves readable fenced C++',()=>{
  const html=chatContent('**解释**\n<img src=x onerror=alert(1)>\n```cpp\nif (a < b) cout << a;\n```');
  assert.ok(html.includes('<strong>解释</strong>'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('a &lt; b'));assert.ok(html.includes('<pre><code>'));
});
