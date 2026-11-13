import assert from 'node:assert/strict';
import {chapterHistory,imagesMarkup} from '../src/chapter-chat.js';
import {cropBounds,validAttachment} from '../src/chat-images.js';
import {extensionConnectionIssue} from '../src/tutor-api.js';
import {createVoiceInput} from '../src/chat-voice.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
const attachment=i=>({name:String(i)+'.png',dataUrl:png});
for(const dataUrl of ['https://example.com/image.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,'+'A'.repeat(2800001)])assert.equal(validAttachment({dataUrl}),false);
const messages=Array.from({length:5},(_,i)=>({role:'user',content:'',attachments:[attachment(i)]}));
assert.deepEqual(chapterHistory(messages).flatMap(m=>m.attachments||[]).map(a=>a.name),['2.png','3.png','4.png']);
assert.equal(messages[0].attachments.length,1,'history must not mutate saved attachments');
assert.equal(chapterHistory([{role:'assistant',content:'text',attachments:[attachment(1)]}])[0].attachments,undefined);
assert.ok(chapterHistory([{role:'user',content:'',attachments:[attachment(0)]}])[0].attachments.length);
const markup=imagesMarkup([{name:'<script>bad</script>',dataUrl:png}],true);
assert.ok(markup.includes('&lt;script&gt;'));assert.ok(!markup.includes('<script>'));assert.ok(markup.includes('data-remove-image="0"'));
assert.deepEqual(cropBounds({x:80,y:70},{x:-10,y:20},100,100),{x:0,y:20,width:80,height:50});
const instances=[],attributes={},texts=[],listeners=new Map(),oldDocument=globalThis.document;
globalThis.document={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
try{
 class Recognition{constructor(){instances.push(this);}start(){}stop(){this.onend();}abort(){this.onend();}}
 const button={setAttribute:(name,value)=>attributes[name]=value},input={value:'原问题',disabled:false},status={};let key='timbre';
 const voice=createVoiceInput({button,input,status,getKey:()=>key,onText:(_,text)=>texts.push(text),toast:assert.fail,Recognition});
 button.onclick();assert.equal(input.readOnly,true);assert.equal(instances[0].lang,'zh-CN');
 instances[0].onresult({results:[[{transcript:'音色是什么'}]]});assert.equal(input.value,'原问题\n音色是什么');assert.equal(texts.length,1);
 key='pitch';voice.cancel();instances[0].onresult({results:[[{transcript:'迟到结果'}]]});assert.equal(texts.length,1);assert.equal(input.readOnly,false);
 button.onclick();instances[1].onerror({error:'network'});assert.match(status.textContent,/Win \+ H/);
 button.onclick();globalThis.document.hidden=true;listeners.get('visibilitychange')();assert.equal(attributes['aria-pressed'],'false');
 voice.dispose();assert.equal(listeners.size,0);
}finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
console.log('图片与语音检查通过：图片边界、最近三图、内容转义、框选坐标、语音草稿与切页清理。');

assert.match(extensionConnectionIssue({getManifest:()=>({content_security_policy:{extension_pages:"connect-src 'none'"}})}),/重新加载/);
assert.match(extensionConnectionIssue({}, {protocol:'chrome-extension:'}),/只刷新页面不会更新权限/);
assert.equal(extensionConnectionIssue({}, {protocol:'http:'}),'');
assert.match(extensionConnectionIssue({getManifest:()=>{throw Error('Extension context invalidated');}}),/重新加载/);
assert.equal(extensionConnectionIssue({getManifest:()=>({host_permissions:['http://127.0.0.1/*'],content_security_policy:{extension_pages:"connect-src 'self' http://127.0.0.1:*"}})}),'');
