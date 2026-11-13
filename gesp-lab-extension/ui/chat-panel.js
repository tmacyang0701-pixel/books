import {escapeHtml as esc} from './core.js';
import {chatStore} from './chat-store.js';
import {ChatSessions, pageChatKey} from './chat-sessions.js';
import {questionsHtml} from './page-questions.js';
import {renderChatMath} from './chat-math.js';
import {validAttachment,fileAttachment,captureLesson,previewCrop,canvasAttachment} from './chat-images.js';
import {createVoiceInput} from './chat-voice.js';
import {fitLessonSidebars} from './sidebar-height.js';

function imagesHtml(images=[],draft=false) {
  return images.filter(validAttachment).map(image=>`<div class="chat-image"><img src="${esc(image.dataUrl)}" alt="${esc(image.name||'提问图片')}" loading="lazy"><span>${esc(image.name||'提问图片')}</span>${draft?`<button type="button" data-remove-image="${esc(image.id)}" aria-label="移除${esc(image.name||'图片')}">×</button>`:''}</div>`).join('');
}

export function chatContent(text) {
  return String(text).split(/(```[\s\S]*?```)/g).map(part=>{
    if (part.startsWith('```') && part.endsWith('```')) {
      const code=part.slice(3,-3).replace(/^[a-zA-Z0-9+#-]*\r?\n/,'');
      return `<pre><code>${esc(code)}</code></pre>`;
    }
    const inline=part.split(/(`[^`\n]+`)/g).map(segment=>segment.startsWith('`')&&segment.endsWith('`')?`<code>${esc(segment.slice(1,-1))}</code>`:esc(segment).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')).join('');
    return `<div class="chat-prose">${inline}</div>`;
  }).join('');
}

export function createChatPanel({api, toast, onOpen=()=>{},getVisualContext=()=>''}) {
  fitLessonSidebars();
  const $=id=>document.getElementById(id);
  let activeKey=null, lastContent='', lastMessageKey='', lastAttachments='',loadingToken=0,mediaBusy=false;
  let followLatest=true,scrollFrame=0,lastScrollTop=0;
  const messages=$('chatMessages');
  function updateScrollButton(){
    $('chatToBottom').hidden=!activeKey||!messages.clientHeight||messages.scrollHeight-messages.scrollTop-messages.clientHeight<=24;
  }
  function scrollLatest(force=false) {
    if(force)followLatest=true;
    if(!followLatest){updateScrollButton();return;}
    const key=activeKey;
    const apply=()=>{if(key===activeKey&&followLatest&&messages.clientHeight){messages.scrollTop=messages.scrollHeight;lastScrollTop=messages.scrollTop;}updateScrollButton();};
    apply();cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(apply);
  }
  $('chatToBottom').onclick=()=>{scrollLatest(true);($('chatInput').disabled?messages:$('chatInput')).focus({preventScroll:true});};
  messages.addEventListener('scroll',()=>{
    if(!messages.clientHeight)return;
    const bottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<=4;
    if(messages.scrollTop<lastScrollTop-1)followLatest=bottom;
    else if(bottom)followLatest=true;
    lastScrollTop=messages.scrollTop;
    updateScrollButton();
  },{passive:true});
  // Images, fonts and composer resizing can change the bottom after a message renders.
  messages.addEventListener('load',()=>scrollLatest(),true);
  const resizeObserver=new ResizeObserver(()=>scrollLatest());resizeObserver.observe(messages);
  document.fonts?.addEventListener('loadingdone',()=>scrollLatest());
  const sessions=new ChatSessions({store:chatStore,api,context:getVisualContext,notify:key=>{if(key===activeKey)render();}});
  function updateDraft(key,text){
    sessions.draft(key,text);
    if(key===activeKey){const input=$('chatInput');if(input.selectionEnd===input.value.length)input.scrollTop=input.scrollHeight;scrollLatest(true);}
  }
  const voice=createVoiceInput({button:$('chatVoice'),input:$('chatInput'),status:$('chatMediaStatus'),getKey:()=>activeKey,onText:updateDraft,toast});

  function toggle(open,{remember=true}={}) {
    if(open)onOpen();
    else voice.cancel();
    $('pageChat').hidden=!open;
    $('pageChat').closest('.player-layout').classList.toggle('chat-collapsed',!open);
    $('togglePageChat').setAttribute('aria-expanded',String(open));
    if(remember)try{localStorage.setItem('ca-lesson-chat-open',JSON.stringify(open));}catch{}
    if(open){$('chatInput').focus({preventScroll:true});scrollLatest(true);}
  }
  function render() {
    const record=sessions.records.get(activeKey);
    if(!record)return;
    const busy=sessions.running.has(activeKey);
    const scrollTop=messages.scrollTop;
    const content=JSON.stringify(record.messages);
    if(content!==lastContent||activeKey!==lastMessageKey){
      $('chatMessages').innerHTML=record.messages.length?record.messages.map((m,i)=>`<article class="chat-message ${m.role==='user'?'from-user':'from-assistant'}"><span class="chat-author">${m.role==='user'?'我':'学伴'}</span><div class="chat-bubble">${imagesHtml(m.attachments)}${m.content?chatContent(m.content):''}${m.status==='pending'?'<div class="chat-thinking"><span></span>正在结合本页思考…</div>':''}${m.status==='error'?`<p class="chat-error">${esc(m.error)}</p>${/后台|问答接口|服务需要更新|重启学习服务|无法连接本地/.test(m.error||'')?'<button type="button" class="ghost" data-start-service>启动／更新后台</button>':''}${i===record.messages.length-1?'<button type="button" class="text-button" data-chat-retry>重试回答</button>':''}`:''}</div></article>`).join(''):'<div class="chat-empty"><span>？</span><h3>这一页，哪里还没理解？</h3><p>可以问知识点、推导步骤或代码。<br>也可以截取课件或上传图片提问。</p></div>';
      renderChatMath($('chatMessages'));
      if(activeKey!==lastMessageKey)followLatest=true;
      if(!followLatest){messages.scrollTop=scrollTop;lastScrollTop=messages.scrollTop;}
      lastContent=content;lastMessageKey=activeKey;
    }
    if($('chatInput').value!==record.draft)$('chatInput').value=record.draft||'';
    const attachments=JSON.stringify(record.draftAttachments||[]);
    if(attachments!==lastAttachments){$('chatAttachments').innerHTML=imagesHtml(record.draftAttachments,true);lastAttachments=attachments;}
    $('chatInput').disabled=busy;
    $('chatSend').disabled=busy||mediaBusy||(!$('chatInput').value.trim()&&!record.draftAttachments?.length);
    for(const id of ['chatVoice','chatChooseImage','chatScreenshot'])$(id).disabled=busy||mediaBusy;
    $('chatSend').setAttribute('aria-busy',String(busy));
    $('chatSend').setAttribute('aria-label',busy?'正在回答':'发送消息');
    $('chatSend').title=busy?'正在回答':'发送消息';
    $('clearPageChat').disabled=busy||(!record.messages.length&&!record.draft&&!record.draftAttachments?.length);
    $('chatSuggestions').hidden=record.messages.length>0;
    $('chatStorageStatus').textContent=record.storageError||'';
    $('chatStorageStatus').hidden=!record.storageError;
    $('chatStorageStatus').classList.toggle('error-text',Boolean(record.storageError));
    scrollLatest();
  }
  async function showPage(lesson,index) {
    const key=pageChatKey(lesson.id,index);
    if(activeKey===key)return;
    voice.cancel();
    activeKey=key;const token=++loadingToken;
    followLatest=true;lastScrollTop=0;
    $('chatToBottom').hidden=true;
    $('chatStorageStatus').hidden=true;
    $('chatPageLabel').textContent=`第 ${index+1} / ${lesson.pages.length} 页`;
    $('chatPageTitle').textContent=lesson.pages[index].title;
    $('chatSuggestions').innerHTML=questionsHtml(lesson.pages[index],lesson);
    $('chatMessages').innerHTML='<p class="chat-loading">正在读取本页对话…</p>';
    $('chatInput').value='';$('chatInput').disabled=true;$('chatSend').disabled=true;
    $('chatAttachments').innerHTML='';lastAttachments='';
    for(const id of ['chatVoice','chatChooseImage','chatScreenshot'])$(id).disabled=true;
    $('clearPageChat').disabled=true;$('chatSuggestions').hidden=true;
    try { await sessions.load(lesson.id,index);if(token===loadingToken)render(); }
    catch(error) { if(token===loadingToken){$('chatMessages').innerHTML=`<p class="chat-error">${esc(error.message)}</p><button class="ghost" type="button" data-chat-reload>重新读取</button>`;$('chatStorageStatus').textContent='问答记录未能读取';$('chatStorageStatus').hidden=false;$('chatStorageStatus').classList.add('error-text');} }
  }
  async function send(text=$('chatInput').value) {
    const key=activeKey;
    if(!key||mediaBusy)return;
    voice.cancel();
    scrollLatest(true);
    try { await sessions.send(key,text); } catch(error){toast(error.message);}
  }
  $('chatForm').onsubmit=event=>{event.preventDefault();send();};
  let fileKey=null;
  $('chatChooseImage').onclick=()=>{voice.cancel();fileKey=activeKey;$('chatImageFile').click();};
  $('chatImageFile').onchange=async()=>{
    const key=fileKey,files=[...$('chatImageFile').files];$('chatImageFile').value='';if(!files.length)return;
    await addMedia(key,async()=>{for(const file of files)await sessions.attach(key,await fileAttachment(file));});
  };
  async function addMedia(key,task){
    if(!key||mediaBusy)return;voice.cancel();mediaBusy=true;render();
    try{await task();}catch(error){toast(error.message||'截图失败，请改用选择图片');}
    finally{mediaBusy=false;render();}
  }
  $('chatScreenshot').onclick=()=>{
    const key=activeKey;
    addMedia(key,async()=>{
      const canvas=await captureLesson($('slideContent'));
      if(key!==activeKey)return;
      const crop=await previewCrop(canvas);if(crop)await sessions.attach(key,canvasAttachment(crop));
    });
  };
  $('chatAttachments').onclick=event=>{const button=event.target.closest('[data-remove-image]');if(button)sessions.removeAttachment(activeKey,button.dataset.removeImage);};
  $('chatInput').addEventListener('paste',event=>{
    const files=[...event.clipboardData.items].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile());
    if(files.length){event.preventDefault();const key=activeKey;addMedia(key,async()=>{for(const file of files)await sessions.attach(key,await fileAttachment(file));});}
  });
  $('chatInput').oninput=()=>{if(activeKey)updateDraft(activeKey,$('chatInput').value);};
  $('chatInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send();}};
  $('chatMessages').onclick=event=>{
    if(event.target.closest('[data-chat-retry]')){scrollLatest(true);sessions.retry(activeKey);}
    if(event.target.closest('[data-chat-reload]')){const key=activeKey;const split=key.lastIndexOf(':');sessions.load(key.slice(0,split),Number(key.slice(split+1))).then(render).catch(error=>toast(error.message));}
  };
  $('chatSuggestions').onclick=event=>{const button=event.target.closest('[data-chat-question]');if(button)send(button.dataset.chatQuestion);};
  $('clearPageChat').onclick=()=>{if(confirm('清空当前这一页的问答和图片？其他页面不受影响。')){voice.cancel();sessions.clear(activeKey);}};
  $('togglePageChat').onclick=()=>toggle($('pageChat').hidden);
  $('closePageChat').onclick=()=>{toggle(false);$('lessonChatHandle').hidden=false;$('lessonChatHandle').focus();};
  let initiallyOpen=!matchMedia('(max-width:850px)').matches;
  try{const saved=JSON.parse(localStorage.getItem('ca-lesson-chat-open'));if(typeof saved==='boolean')initiallyOpen=saved;}catch{}
  toggle(initiallyOpen,{remember:false});
  async function forgetLesson(lessonId){if(activeKey?.startsWith(lessonId+':')){voice.cancel();activeKey=null;loadingToken++;lastContent='';lastMessageKey='';}await sessions.removeLesson(lessonId);}
  return {showPage,toggle,forgetLesson,cancelInput:()=>voice.cancel()};
}
