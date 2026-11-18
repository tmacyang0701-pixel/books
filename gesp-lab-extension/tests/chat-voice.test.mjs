import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceInput as gespVoice} from '../ui/chat-voice.js';
import {createVoiceInput as physicsVoice} from '../../physics-lab-extension/src/chat-voice.js';

for(const [name,createVoiceInput]of [['GESP',gespVoice],['physics',physicsVoice]]){
 function setup({constructorError,startError,abortError,unsupported=false}={}){
  const instances=[],texts=[],pending=new Map(),attrs={};let sequence=0,key='page:1',focused=0;
  const timers={setTimeout(fn,ms){const id=++sequence;pending.set(id,{fn,ms});return id;},clearTimeout(id){pending.delete(id);}};
  class Recognition{
   constructor(){if(constructorError)throw constructorError;instances.push(this);}
   start(){if(startError)throw startError;}
   stop(){this.stopped=true;}
   abort(){if(abortError)throw Error('abort failed');this.onend?.();}
  }
  const button={setAttribute:(k,v)=>{attrs[k]=v;}},input={value:'已有草稿',focus:()=>focused++},status={textContent:''};
  const voice=createVoiceInput({button,input,status,getKey:()=>key,onText:(...args)=>texts.push(args),toast:()=>{},Recognition:unsupported?null:Recognition,timers});
  return {voice,button,input,status,instances,texts,pending,attrs,get focused(){return focused;},setKey:value=>{key=value;},fire(ms){const job=[...pending].find(([,v])=>v.ms===ms);assert.ok(job,`missing timer ${ms}`);pending.delete(job[0]);job[1].fn();}};
 }
 test(`${name}: constructor and start failures restore typing and show actual error`,()=>{
  for(const option of ['constructorError','startError']){
   const f=setup({[option]:{name:'NotAllowedError'}});assert.doesNotThrow(()=>f.button.onclick());
   assert.match(f.status.textContent,/not-allowed/);assert.match(f.status.textContent,/Windows/);
   assert.equal(f.input.readOnly,false);assert.equal(f.input.value,'已有草稿');assert.ok(f.focused);assert.equal(f.pending.size,0);
  }
 });
 test(`${name}: pending startup and stop cannot lock the input indefinitely`,()=>{
  const f=setup();f.button.onclick();assert.match(f.status.textContent,/正在启动/);
  f.fire(15000);assert.match(f.status.textContent,/start-timeout/);assert.equal(f.input.readOnly,false);
  f.button.onclick();f.instances[1].onstart();assert.match(f.status.textContent,/正在听/);
  f.instances[1].onresult({results:[[{transcript:'识别文字'}]]});f.button.onclick();f.fire(8000);
  assert.match(f.status.textContent,/result-timeout/);assert.equal(f.input.value,'已有草稿\n识别文字');assert.equal(f.input.readOnly,false);
 });
 test(`${name}: network errors survive late events, and abort failures never block cancellation`,()=>{
  const f=setup({abortError:true});f.button.onclick();const first=f.instances[0];first.onerror({error:'network'});
  assert.match(f.status.textContent,/network/);assert.ok(f.focused);first.onend();assert.match(f.status.textContent,/network/);
  f.button.onclick();first.onresult({results:[[{transcript:'迟到'}]]});assert.equal(f.texts.length,0);
  assert.doesNotThrow(()=>f.voice.cancel());assert.equal(f.input.readOnly,false);assert.equal(f.pending.size,0);
 });
 test(`${name}: empty result is not success and page changes never write old speech`,()=>{
  const f=setup();f.button.onclick();f.instances[0].onend();assert.match(f.status.textContent,/没有识别到文字/);
  f.button.onclick();f.setKey('page:2');f.instances[1].onresult({results:[[{transcript:'旧页面语音'}]]});
  assert.equal(f.texts.length,0);assert.equal(f.input.value,'已有草稿');assert.equal(f.input.readOnly,false);
  f.voice.dispose();assert.equal(f.button.onclick,null);assert.equal(f.pending.size,0);
 });
 test(`${name}: missing browser speech support focuses the editable input for Windows dictation`,()=>{
  const f=setup({unsupported:true});f.button.onclick();assert.match(f.status.textContent,/Win \+ H/);assert.ok(f.focused);assert.equal(f.input.value,'已有草稿');
 });
}
