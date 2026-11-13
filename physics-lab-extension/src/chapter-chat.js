import { MAX_IMAGES, validAttachment, fileAttachment, captureLesson, previewCrop, canvasAttachment } from './chat-images.js';
import { createVoiceInput } from './chat-voice.js';
import { modules } from './curriculum.js';
import { createTutorApi, createTutorStore, sharedServiceUrl } from './tutor-api.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store=createTutorStore();
export const chapterContext=lesson=>({id:lesson.id,title:lesson.title,subtitle:lesson.subtitle,module:modules.find(m=>m.id===lesson.module).name,
  goal:lesson.goal,sections:lesson.sections,formula:lesson.formula,takeaway:lesson.takeaway,pitfall:lesson.pitfall,example:lesson.example,activity:lesson.activity,selfCheck:lesson.question});
export function chapterHistory(messages) {
  const history=messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string'&&(m.content.trim()||m.attachments?.some(validAttachment))).slice(-20).map(m=>({role:m.role,content:m.content.slice(0,4000),...(m.role==='user'&&m.attachments?.length?{attachments:m.attachments.filter(validAttachment).slice(0,MAX_IMAGES)}:{})}));
  while(history.length>1&&history.reduce((sum,m)=>sum+m.content.length,0)>20000)history.shift();
  let remaining=MAX_IMAGES;
  for(const message of [...history].reverse()){
    if(!message.attachments)continue;
    const included=remaining?message.attachments.slice(-remaining):[];remaining-=included.length;
    if(included.length)message.attachments=included;
    else {delete message.attachments;message.content=(message.content+'（较早图片本轮未附带）').slice(0,4000);}
  }
  while(history.length>1&&history.reduce((sum,m)=>sum+m.content.length,0)>20000)history.shift();
  return history;
}
export function imagesMarkup(images=[],draft=false){
  return images.filter(validAttachment).map((img,index)=>`<figure class="chapter-image"><img src="${esc(img.dataUrl)}" alt="${esc(img.name||'提问图片')}" loading="lazy"><figcaption>${esc(img.name||'提问图片')}</figcaption>${draft?`<button type="button" data-remove-image="${index}" aria-label="移除${esc(img.name||'图片')}" title="移除图片">×</button>`:''}</figure>`).join('');
}
export function chapterAnswer(job,chapterId) {
  if(job.kind!=='physics-chat'||job.problemId!==chapterId||job.result?.chapterId!==chapterId||typeof job.result.answer!=='string'||!job.result.answer.trim()||job.result.answer.length>4000)throw Error('回答与当前章节不匹配，请重试。');
  return job.result.answer;
}

export function mountChapterChat(root, lesson) {
  const context=chapterContext(lesson),key='chapter:'+lesson.id,api=createTutorApi(sharedServiceUrl()),controller=new AbortController();
  let alive=true,ready=false,busy=false,askingQuestions=false,mediaBusy=false,voice=null;
  let state={messages:[],draft:'',draftAttachments:[],questions:[],pending:null,questionTask:null,failed:false,failureMessage:'',contextStamp:JSON.stringify(context)};
  let message='正在读取本节对话…',questionMessage='正在准备本节问题…';
  const save=()=>store.put(key,state);
  const report=text=>{message=text;if(alive)update();};
  const displayError=error=>error.status===404?'后台接口需要更新，请点击“启动／更新后台”后重试。':error.message;
  function update() {
    root.querySelector('.chapter-chat-status').textContent=message;
    const send=root.querySelector('[data-chat-send]');send.disabled=!ready||busy||mediaBusy||Boolean(state.pending)||(!root.querySelector('textarea').value.trim()&&!state.draftAttachments.length);
    root.querySelectorAll('[data-chat-media]').forEach(button=>button.disabled=!ready||busy||mediaBusy||Boolean(state.pending));
    send.setAttribute('aria-busy',String(busy));send.setAttribute('aria-label',busy?'正在回答':'发送消息');send.title=busy?'正在回答':'发送消息';
    root.querySelector('[data-service-start]').hidden=!/后台|连接/.test(message+' '+questionMessage);
    root.querySelector('[data-chat-retry]').hidden=!ready||busy||!state.failed&&!state.pending;
    root.querySelector('[data-chat-retry]').textContent=state.pending?'继续接收回答':'重试这条问题';
    root.querySelector('[data-questions-retry]').hidden=askingQuestions||state.questions.length>0;
    root.querySelector('.chapter-question-status').textContent=questionMessage;
    const label=root.querySelector('.chapter-suggestions summary span');label.textContent=askingQuestions?'生成中':questionMessage?'待重试':'AI 推荐';label.title=questionMessage;
    root.querySelectorAll('[data-ask]').forEach(button=>button.disabled=!ready||busy||mediaBusy||Boolean(state.pending));
  }
  function renderMessages() {
    const list=root.querySelector('.chapter-chat-messages');
    list.innerHTML=state.messages.length?state.messages.map(m=>`<article class="chapter-message ${m.role==='user'?'from-user':'from-assistant'}"><strong>${m.role==='user'?'我':'物理学伴'}</strong>${imagesMarkup(m.attachments)}<p>${esc(m.content)}</p></article>`).join(''):'<p class="chapter-chat-empty">可以问本节里的概念、例子或不理解的句子。学伴会结合当前内容回答。</p>';
    list.scrollTop=list.scrollHeight;
  }
  function renderAttachments(){root.querySelector('.chapter-attachments').innerHTML=imagesMarkup(state.draftAttachments,true);}
  function renderQuestions() {
    const list=root.querySelector('.chapter-questions');
    list.innerHTML=state.questions.map((q,i)=>`<button type="button" data-ask="${i}" title="${esc(q)}">${esc(q)} <span aria-hidden="true">↗</span></button>`).join('');
    list.querySelectorAll('[data-ask]').forEach(button=>button.onclick=()=>send(state.questions[Number(button.dataset.ask)]));
    update();
  }
  root.innerHTML=`<div class="chapter-chat-heading"><div><h2>本节问答</h2><p>${esc(lesson.subtitle)}</p></div><div class="chapter-chat-actions"><span class="chapter-ai-badge" role="status">检测后台…</span><button type="button" class="chapter-chat-close" aria-label="收起本节问答" title="收起本节问答">›</button></div></div><details class="chapter-suggestions"><summary>本节可以这样问 <span>AI 推荐</span></summary><div class="chapter-questions"></div><p class="chapter-question-status"></p><button class="text-link" type="button" data-questions-retry hidden>重新生成推荐问题</button></details><div class="chapter-chat-messages" role="log" aria-label="本节对话记录" aria-live="polite"></div><p class="chapter-chat-status" role="status" aria-live="polite"></p><button class="text-link chapter-start-service" type="button" data-service-start hidden>启动／更新后台</button><button class="text-link" type="button" data-chat-retry hidden>重试这条问题</button><form class="chapter-chat-form"><div class="chapter-input-shell"><div class="chapter-attachments" aria-label="待发送图片"></div><label class="sr-only" for="chapter-question-${lesson.id}">向本节学伴提问</label><textarea id="chapter-question-${lesson.id}" rows="2" maxlength="4000" title="Enter 发送 · Shift+Enter 换行" placeholder="输入本节的问题…"></textarea><div class="chapter-input-actions"><div class="chapter-media-tools"><button type="button" data-chat-media="voice" aria-label="语音输入" title="语音输入" aria-pressed="false"><svg class="chat-mic-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3.5M8.5 21.5h7"/></svg><svg class="chat-stop-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button><button type="button" data-chat-media="image" aria-label="选择图片" title="选择图片"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></button><button type="button" data-chat-media="screenshot" aria-label="截取课件" title="截取课件"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><rect x="7" y="7" width="10" height="10" rx="1" stroke-dasharray="2 3"/></svg></button><input type="file" data-chat-files accept="image/png,image/jpeg,image/webp" multiple hidden></div><button type="submit" class="chapter-send-icon" data-chat-send aria-label="发送消息" title="发送消息"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div></div><p class="chapter-media-status" role="status"></p></form>`;
  const toggle=document.querySelector('.chapter-chat-toggle'),narrow=matchMedia('(max-width: 760px)');
  let explicitOpen;
  try{const preference=localStorage.getItem('physics-chapter-chat-open');if(preference!==null)explicitOpen=preference==='true';}catch{}
  function setOpen(open,{remember=false,focus=false}={}){
    if(!open)voice?.cancel();
    root.hidden=!open;document.body.classList.toggle('chapter-chat-open',open);
    toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'收起问答':'本节问答';
    if(remember){explicitOpen=open;try{localStorage.setItem('physics-chapter-chat-open',String(open));}catch{}}
    if(focus)(open?root.querySelector('textarea'):toggle).focus({preventScroll:true});
  }
  document.body.classList.add('has-chapter-chat');setOpen(explicitOpen??!narrow.matches);
  const onResize=()=>setOpen(explicitOpen??!narrow.matches);
  narrow.addEventListener('change',onResize);
  toggle.onclick=()=>setOpen(root.hidden,{remember:true,focus:true});
  root.querySelector('.chapter-chat-close').onclick=()=>setOpen(false,{remember:true,focus:true});
  root.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false,{remember:true,focus:true});}};
  renderMessages();update();
  const input=root.querySelector('textarea');
  const mediaStatus=root.querySelector('.chapter-media-status');
  const draft=value=>{state.draft=value;update();save().catch(()=>report('草稿暂未保存，请检查浏览器存储空间。'));};
  voice=createVoiceInput({button:root.querySelector('[data-chat-media="voice"]'),input,status:mediaStatus,getKey:()=>alive?key:null,onText:(_,text)=>draft(text),toast:text=>{mediaStatus.textContent=text;}});
  input.oninput=()=>draft(input.value);
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send(input.value);}};
  root.querySelector('form').onsubmit=event=>{event.preventDefault();send(input.value);};
  root.querySelector('[data-questions-retry]').onclick=()=>loadQuestions();
  root.querySelector('[data-chat-retry]').onclick=()=>state.pending?resumeChat():send('',true);
  async function addMedia(prepare){
    if(!alive||!ready||busy||mediaBusy||state.pending)return;
    voice.cancel();mediaBusy=true;mediaStatus.textContent='正在准备图片…';update();
    try{
      const images=await prepare();if(!alive)return;
      if(state.draftAttachments.length+images.length>MAX_IMAGES)throw Error('每条问题最多添加 3 张图片，请先移除一张。');
      state.draftAttachments.push(...images);await save();
      mediaStatus.textContent=images.length?'图片已加入，补充问题后发送，也可只发送图片。':'';
    }catch(error){if(alive)mediaStatus.textContent=error.message||'图片处理失败，请重新选择。';}
    finally{mediaBusy=false;if(alive){renderAttachments();update();}}
  }
  const fileInput=root.querySelector('[data-chat-files]');
  root.querySelector('[data-chat-media="image"]').onclick=()=>{voice.cancel();fileInput.click();};
  const addFiles=files=>addMedia(async()=>{
    if(files.length+state.draftAttachments.length>MAX_IMAGES)throw Error('每条问题最多添加 3 张图片。');
    return Promise.all(files.map(fileAttachment));
  });
  fileInput.onchange=()=>{const files=[...fileInput.files];fileInput.value='';if(files.length)addFiles(files);};
  input.addEventListener('paste',event=>{
    const files=[...event.clipboardData.items].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile());
    if(files.length){event.preventDefault();addFiles(files);}
  });
  root.querySelector('[data-chat-media="screenshot"]').onclick=()=>addMedia(async()=>{
    if(state.draftAttachments.length>=MAX_IMAGES)throw Error('每条问题最多添加 3 张图片，请先移除一张。');
    const canvas=await captureLesson(document.querySelector('.reading-content'));if(!alive)return [];
    const crop=await previewCrop(canvas,controller.signal);return crop?[canvasAttachment(crop)]:[];
  });
  root.querySelector('.chapter-attachments').onclick=event=>{
    const button=event.target.closest('[data-remove-image]');if(!button||busy||mediaBusy)return;
    state.draftAttachments.splice(Number(button.dataset.removeImage),1);renderAttachments();update();save().catch(()=>report('图片草稿暂未保存，请检查浏览器存储空间。'));
  };
  async function poll(id,kind,onProgress) {
    while(alive){
      const job=await api('/jobs/'+id,undefined,controller.signal);
      if(job.kind!==kind||job.problemId!==lesson.id)throw Error('任务与当前章节不匹配。');
      if(job.status==='failed'){const error=Error(job.message||'生成失败，请重试。');error.terminal=true;throw error;}
      if(job.status==='completed')return job;
      onProgress(job.message||'正在生成…');
      await new Promise(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,1200);controller.signal.addEventListener('abort',done,{once:true});});
    }
    throw new DOMException('离开章节','AbortError');
  }
  async function loadQuestions() {
    if(askingQuestions||!alive)return;askingQuestions=true;questionMessage='LLM 正在根据本节生成问题…';update();
    try {
      let result;
      if(!state.questionTask){
        result=await api('/questions',{chapter:context},controller.signal);
        if(!result.questions){if(!/^[a-f0-9]{32}$/.test(result.id||''))throw Error('推荐问题任务无效。');state.questionTask=result.id;await save();}
      }
      if(state.questionTask)result=(await poll(state.questionTask,'physics-questions',text=>{questionMessage=text;if(alive)update();})).result;
      if(result.chapterId!==lesson.id||!Array.isArray(result.questions)||result.questions.length!==3||result.questions.some(q=>typeof q!=='string'||!q.trim()||q.length>45))throw Error('本节推荐问题不完整，请重试。');
      state.questions=result.questions;state.questionTask=null;await save();questionMessage='';if(alive)renderQuestions();
    }catch(error){if(alive){
      if(error.status===404&&state.questionTask){state.questionTask=null;await save().catch(()=>{});askingQuestions=false;return loadQuestions();}
      if(error.terminal)state.questionTask=null;save().catch(()=>{});questionMessage=displayError(error);
    }}
    finally{askingQuestions=false;if(alive)update();}
  }
  async function send(value,retry=false) {
    if(!alive||!ready||busy||mediaBusy||state.pending)return;
    const content=String(value).trim();if(!retry&&!content&&!state.draftAttachments.length)return;
    if(retry&&state.messages.at(-1)?.role!=='user')return;
    if(content.length>4000){report('问题最多 4000 字。');return;}
    voice.cancel();busy=true;state.failed=false;state.failureMessage='';
    if(!retry){state.messages.push({role:'user',content:content||'请结合图片和本节内容帮我理解。',...(state.draftAttachments.length?{attachments:structuredClone(state.draftAttachments)}:{})});state.messages=state.messages.slice(-100);state.draft='';state.draftAttachments=[];input.value='';renderAttachments();}
    root.querySelector('.chapter-suggestions').open=false;renderMessages();report('正在发送问题…');
    try {
      await save();
      const messages=chapterHistory(state.messages);
      if(messages.some(m=>m.attachments?.length)){
        const health=await api('/health');if(!health.chapterImages)throw Error('请点击“启动／更新后台”启用图片问答，再重试这条问题。');
      }
      const job=await api('/chat',{chapter:context,messages});
      if(!/^[a-f0-9]{32}$/.test(job.id||''))throw Error('后台问答任务无效。');
      state.pending=job.id;await save();
      if(alive){busy=false;await resumeChat();}
    }catch(error){state.failed=true;state.failureMessage=displayError(error);save().catch(()=>{});if(alive)report(state.failureMessage);}
    finally{busy=false;if(alive)update();}
  }
  async function resumeChat() {
    if(busy||!state.pending||!alive)return;busy=true;report('正在接收回答…');
    try {
      const job=await poll(state.pending,'physics-chat',report);
      let answer;try{answer=chapterAnswer(job,lesson.id);}catch(error){error.terminal=true;throw error;}
      state.messages.push({role:'assistant',content:answer});state.pending=null;state.failed=false;state.failureMessage='';await save();
      if(alive){renderMessages();report('回答基于本节内容，可继续追问。');}
    }catch(error){if(alive){if(error.terminal||error.status===404)state.pending=null;state.failed=true;state.failureMessage=error.status===404?'上次回答任务因后台重启或过期而失效，请点击“重试这条问题”。':displayError(error);await save().catch(()=>{});report(state.failureMessage);}}
    finally{busy=false;if(alive)update();}
  }
  (async()=>{
    try {
      const saved=await store.get(key);
      if(saved){
        state.messages=Array.isArray(saved.messages)?saved.messages.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-100).map(m=>({role:m.role,content:m.content.slice(0,4000),...(m.role==='user'&&Array.isArray(m.attachments)?{attachments:m.attachments.filter(validAttachment).slice(0,MAX_IMAGES)}:{})})):[];
        state.draftAttachments=Array.isArray(saved.draftAttachments)?saved.draftAttachments.filter(validAttachment).slice(0,MAX_IMAGES):[];
        state.draft=typeof saved.draft==='string'?saved.draft.slice(0,4000):'';
        state.questions=saved.contextStamp===state.contextStamp&&Array.isArray(saved.questions)?saved.questions.filter(q=>typeof q==='string'&&q.length<=45).slice(0,3):[];
        state.pending=/^[a-f0-9]{32}$/.test(saved.pending||'')?saved.pending:null;
        state.questionTask=/^[a-f0-9]{32}$/.test(saved.questionTask||'')?saved.questionTask:null;
        state.failed=Boolean(saved.failed);
        state.failureMessage=typeof saved.failureMessage==='string'?saved.failureMessage.slice(0,1000):'';
      }
    }catch{message='本机对话缓存不可用，发送前会再次尝试保存。';}
    if(!alive)return;
    ready=true;input.value=state.draft;renderAttachments();root.querySelector('.chapter-suggestions').open=!state.messages.length&&innerHeight>=650;renderMessages();renderQuestions();
    report(state.pending?'正在恢复本节回答…':state.failed?(state.failureMessage||'上一条问题没有完成，请点击“重试这条问题”继续。'):'结合本节内容提问，支持连续追问。');
    if(state.questions.length===3){questionMessage='';update();}else loadQuestions();
    if(state.pending)resumeChat();
  })();
  (async()=>{
    const badge=root.querySelector('.chapter-ai-badge');
    try{const health=await api('/health',undefined,controller.signal);if(!alive)return;badge.textContent=health.configured?'后台已连接':'待配置模型';badge.title=sharedServiceUrl()+' · '+health.model;badge.dataset.state=health.configured?'ready':'error';}
    catch(error){if(alive){badge.textContent='后台未连接';badge.title=displayError(error);badge.dataset.state='error';}}
  })();
  return ()=>{alive=false;voice.dispose();controller.abort();narrow.removeEventListener('change',onResize);document.body.classList.remove('has-chapter-chat','chapter-chat-open');};
}
