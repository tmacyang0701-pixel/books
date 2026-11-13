import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChatSessions,chatContextMessages} from '../ui/chat-sessions.js';
import {cropBounds,validAttachment} from '../ui/chat-images.js';
import {createVoiceInput} from '../ui/chat-voice.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
const attachment=id=>({id,name:id+'.png',dataUrl:png});
function storage(){const data=new Map();return {data,async get(key){return structuredClone(data.get(key));},async put(row){data.set(row.key,structuredClone(row));},async deleteLesson(id){for(const key of data.keys())if(key.startsWith(id+':'))data.delete(key);}};}

test('image drafts and image-only questions persist on their own page, retry without duplication',async()=>{
  const store=storage(),requests=[];let attempt=0;
  const api=async(path,body)=>{if(body){requests.push(body);return{id:String(++attempt)};}return attempt===1?{status:'failed',error:{message:'vision unavailable'}}:{status:'completed',result:{lessonId:'lesson',pageIndex:0,answer:'answer'}};};
  let sessions=new ChatSessions({store,api});let page=await sessions.load('lesson',0);
  await sessions.attach(page.key,attachment('first'));
  await sessions.load('lesson',1);
  assert.equal(sessions.records.get('lesson:1').draftAttachments.length,0);
  sessions=new ChatSessions({store,api});page=await sessions.load('lesson',0);
  assert.equal(page.draftAttachments[0].dataUrl,png);
  await sessions.send(page.key,'');assert.equal(page.messages.at(-1).status,'error');
  await sessions.retry(page.key);
  assert.equal(page.messages.length,2);assert.equal(page.draftAttachments.length,0);
  assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].messages[0].attachments[0].dataUrl,png);
  await sessions.clear(page.key);assert.deepEqual(store.data.get(page.key).messages,[]);
});

test('attachment bounds and removal prevent invalid requests, history keeps at most three newest images',async()=>{
  assert.equal(validAttachment({dataUrl:'https://example.com/image.png'}),false);
  assert.equal(validAttachment({dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}),false);
  const sessions=new ChatSessions({store:storage(),api:async()=>{}}),page=await sessions.load('x',0);
  for(let i=0;i<3;i++)await sessions.attach(page.key,attachment(String(i)));
  await assert.rejects(sessions.attach(page.key,attachment('fourth')),/最多/);
  await sessions.removeAttachment(page.key,'1');assert.deepEqual(page.draftAttachments.map(a=>a.id),['0','2']);
  const messages=Array.from({length:5},(_,i)=>({role:'user',status:'complete',content:String(i),attachments:[attachment(String(i))]}));
  const context=chatContextMessages(messages);
  assert.deepEqual(context.flatMap(m=>m.attachments||[]).map(a=>a.name),['2.png','3.png','4.png']);
  await sessions.removeLesson('x');await assert.rejects(sessions.attach(page.key,attachment('late')),/关闭/);
});

test('crop coordinates work in both directions and clamp to the image',()=>{
  assert.deepEqual(cropBounds({x:80,y:70},{x:-10,y:20},100,100),{x:0,y:20,width:80,height:50});
  assert.deepEqual(cropBounds({x:20,y:30},{x:140,y:160},100,100),{x:20,y:30,width:80,height:70});
});

test('voice fills an editable draft, does not auto-send, and ignores late results after a page switch',()=>{
  const instances=[];class Recognition{constructor(){instances.push(this);}start(){}stop(){this.onend();}abort(){this.onend();}}
  const button={setAttribute(){}},input={value:'原问题',disabled:false},status={},texts=[];
  let key='page:0';const voice=createVoiceInput({button,input,status,getKey:()=>key,onText:(...v)=>texts.push(v),toast:assert.fail,Recognition});
  button.onclick();assert.equal(input.readOnly,true);assert.equal(instances[0].lang,'zh-CN');
  instances[0].onresult({results:[[{transcript:'新的语音'}]]});
  assert.equal(input.value,'原问题\n新的语音');assert.equal(texts.length,1);
  key='page:1';voice.cancel();instances[0].onresult({results:[[{transcript:'迟到的结果'}]]});
  assert.equal(texts.length,1);assert.equal(input.readOnly,false);
  button.onclick();instances[1].onerror({error:'network'});instances[1].onend();
  assert.match(status.textContent,/Win \+ H/);assert.equal(input.readOnly,false);
});
