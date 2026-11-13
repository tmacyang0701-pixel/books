import { modules, lessons } from './curriculum.js';
import { examQuestions, examSources, restoreQuestionAnswers } from './exam-bank.js';
import { questionMarkup, bindQuestionCards } from './exam-view.js';
import { DEFAULT_SERVICE, normalizeServiceUrl, createTutorApi, createTutorStore } from './tutor-api.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = createTutorStore();
const serviceKey = 'physics-shared-service';
const tableMarkup = table => table ? `<div class="record-table"><table><thead><tr>${table.headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';

export function questionContext(q) {
  return {...q, note:[q.note, examSources[q.year].numbering].filter(Boolean).join('；'),
    chapters:q.lessonIds.map(id=>{const l=lessons.find(x=>x.id===id);return {id,module:modules.find(m=>m.id===l.module).name,title:l.subtitle};})};
}
export function checkedPackage(value, q) {
  if (value?.schema !== 1 || value.questionId !== q.id || !/^[a-f0-9]{32}$/.test(value.id || '') || !Array.isArray(value.pages) || value.pages.length < 6 || value.variants?.length !== 3) throw Error('物理课件内容不完整，请重新生成。');
  for (const p of value.pages) if (!p.title || !Array.isArray(p.content) || !p.narration) throw Error('课件页缺少正文或讲稿。');
  const ids = new Set();
  for (const v of value.variants) {
    if (!new RegExp(`^physics-${value.id}-[123]$`).test(v.id) || ids.has(v.id) || v.sourceQuestionId !== q.id || v.kind !== 'generated' || !v.parts?.length || !v.steps?.length || !v.hints?.length || !v.knowledgePoints?.length || !v.lessonIds?.length || !v.lessonIds.every(id=>q.lessonIds.includes(id))) throw Error('变式题与当前原题不匹配，请重新生成。');
    ids.add(v.id);
  }
  return value;
}

export function mountTutor(root, questionId) {
  const q = examQuestions.find(item=>item.id===questionId);
  if (!q) { root.innerHTML='<div class="empty-state"><h1>请先选择一道原题</h1><a class="button" href="#exams">进入上海中考题库</a></div>';return ()=>{}; }
  let alive = true, busy = false, initializing = true, watching = false, tab = 'lesson', frame = 0;
  let state = {lesson:null, page:0, answers:{}, pending:null, requirements:''};
  let serviceUrl = DEFAULT_SERVICE, api, message = '正在读取本题课件…', connectionText = '正在连接 GESP 共享后台', storageMessage = '';
  let statusKind = 'working';
  const controller = new AbortController();
  try { serviceUrl = normalizeServiceUrl(/^https?:$/.test(location.protocol) && location.pathname.startsWith('/physics/') ? location.origin : localStorage.getItem(serviceKey) || DEFAULT_SERVICE); } catch { /* Use the fixed loopback default. */ }
  api = createTutorApi(serviceUrl);
  const save = async () => { try { await store.put(q.id,state); } catch { storageMessage='本机缓存未能保存；生成内容仍在共享后台，下次连接后可重新读取。'; if(alive) updateStatus(); } };
  const status = (text, kind='working') => { message=text;statusKind=kind;if(alive)updateStatus(); };
  function updateStatus() {
    const node=root.querySelector('.tutor-status');if(!node)return;
    node.textContent=message;node.dataset.state=statusKind;
    root.querySelector('.tutor-connection').textContent=connectionText;
    root.querySelector('.tutor-storage').textContent=storageMessage;
    const button=root.querySelector('[data-generate]');button.disabled=busy||initializing||Boolean(state.pending);
    button.textContent=busy?'正在生成讲解与变式…':state.lesson?'重新生成讲解与 3 道变式':'生成讲解与 3 道变式';
    root.querySelector('[data-resume]').hidden=!state.pending||busy;
    root.querySelector('[data-reconnect]').disabled=busy||initializing;
    root.querySelector('[name="endpoint"]').disabled=busy||Boolean(state.pending);
    root.querySelector('[data-save-endpoint]').disabled=busy||Boolean(state.pending);
  }
  function render() {
    const source=examSources[q.year];
    root.innerHTML=`<div class="back-row"><a href="#exam/${q.id}">← 返回原题作答</a><a href="#exams">全部上海中考题 ↗</a></div>
      <div class="page-heading tutor-heading"><div><span class="eyebrow">PHYSICS / EXPLAIN & PRACTICE</span><h1>${esc(q.title)}</h1><p>上海 ${q.year} 年中考 · ${source.numbering?'整理版':''}第 ${esc(q.number)} 题 · 讲解与变式练习</p></div></div>
      <div class="tutor-tags">${q.lessonIds.map(id=>`<a href="#lesson/${id}">${esc(lessons.find(l=>l.id===id).subtitle)} ↗</a>`).join('')}${q.knowledgePoints.map(point=>`<span>${esc(point)}</span>`).join('')}</div>
      <details class="tutor-original"><summary>查看原题条件</summary><p>${esc(q.stem)}</p>${tableMarkup(q.table)}<ul>${q.parts.map(p=>`<li>${esc(p.label)}${p.options?'：'+p.options.map(esc).join(' / '):p.unit?'（'+esc(p.unit)+'）':''}</li>`).join('')}</ul><a href="${source.url}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a></details>
      <section class="tutor-generation"><form class="tutor-generate-form"><label>讲解要求（可选）<input name="requirements" maxlength="2000" value="${esc(state.requirements)}" placeholder="例如：重点解释为什么用排水体积，步骤细一些"></label><button class="button" data-generate>生成讲解与 3 道变式</button></form>
        <p class="tutor-status" role="status" aria-live="polite"></p><button class="button secondary" type="button" data-resume hidden>继续查询任务</button><p class="tutor-storage" role="status"></p>
        <details class="tutor-service"><summary>GESP 共享后台 · <span class="tutor-connection"></span></summary><p>与 GESP 使用同一个后台和模型配置。在 GESP 页面点击“启动／更新后台”后即可生成；已有课件和变式可在本机继续学习。</p><form class="tutor-endpoint-form"><label>后台地址<input name="endpoint" value="${esc(serviceUrl)}" type="url" required></label><button class="button secondary" data-save-endpoint>保存地址</button><button class="button secondary" type="button" data-reconnect>重新连接</button></form></details>
      </section><section class="tutor-content"></section>`;
    const requirements=root.querySelector('[name="requirements"]');
    requirements.oninput=()=>{state.requirements=requirements.value;save();};
    root.querySelector('.tutor-generate-form').onsubmit=event=>{event.preventDefault();generate();};
    root.querySelector('[data-resume]').onclick=()=>watch();
    root.querySelector('[data-reconnect]').onclick=()=>refresh();
    root.querySelector('.tutor-endpoint-form').onsubmit=event=>{
      event.preventDefault();
      try { serviceUrl=normalizeServiceUrl(root.querySelector('[name="endpoint"]').value);api=createTutorApi(serviceUrl);localStorage.setItem(serviceKey,serviceUrl);refresh(); }
      catch(error){status(error.message,'error');}
    };
    drawContent();updateStatus();
  }
  function drawContent() {
    const content=root.querySelector('.tutor-content'),pack=state.lesson;
    if (!pack) {content.innerHTML='<div class="tutor-empty"><h2>把一道题学透，再独立做三道。</h2><p>生成后可按“读题 → 知识 → 思路 → 步骤 → 易错 → 总结”逐页学习，并阅读详细讲稿。三道原创变式分别巩固方法、迁移情境和检验边界。</p><p>原题年份与来源保留，AI 原创练习单独标识。</p></div>';return;}
    state.page=Math.min(pack.pages.length-1,Math.max(0,Number(state.page)||0));
    content.innerHTML=`<div class="tutor-content-heading"><div><h2>${esc(pack.title)}</h2><p>${esc(pack.summary)}</p><small>AI 生成 · ${esc(pack.model)} · ${new Date(pack.createdAt*1000).toLocaleString('zh-CN')}</small></div><nav class="tutor-tabs" aria-label="讲解与练习"><button type="button" data-tab="lesson" aria-pressed="${tab==='lesson'}">逐页讲解</button><button type="button" data-tab="practice" aria-pressed="${tab==='practice'}">变式练习 · 3 道</button></nav></div><div class="tutor-body"></div>`;
    content.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;stopSpeech();drawContent();});
    if (tab==='practice') {
      const variants=pack.variants;
      content.querySelector('.tutor-body').innerHTML=`<p class="tutor-practice-intro">三题沿用原题知识点，逐步改变数据、情境或边界。先独立作答，需要时展开提示，提交后查看答案与解析。</p><div class="exam-list">${variants.map(v=>questionMarkup(v,state.answers[v.id])).join('')}</div>`;
      bindQuestionCards(content.querySelector('.exam-list'),variants,state.answers,save);
    } else drawPage();
  }
  function drawPage() {
    const pack=state.lesson,p=pack.pages[state.page],body=root.querySelector('.tutor-body');
    body.innerHTML=`<div class="tutor-reader"><nav class="tutor-outline" aria-label="讲解目录">${pack.pages.map((page,i)=>`<button type="button" data-slide="${i}" ${i===state.page?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')} · ${esc(page.kind)}</span>${esc(page.title)}</button>`).join('')}</nav><article class="tutor-slide"><div class="tutor-slide-toolbar"><span>${esc(p.kind)} · ${state.page+1} / ${pack.pages.length}</span><div><button class="button secondary" type="button" data-prev ${state.page===0?'disabled':''}>上一页</button><button class="button secondary" type="button" data-next ${state.page===pack.pages.length-1?'disabled':''}>下一页</button></div></div><h2 tabindex="-1">${esc(p.title)}</h2><div class="tutor-prose">${p.content.map(t=>`<p>${esc(t)}</p>`).join('')}</div>${tableMarkup(p.table)}<div class="tutor-visual"></div><details class="tutor-narration"><summary>展开详细讲稿</summary><p>${esc(p.narration)}</p><button class="button secondary" type="button" data-speak>朗读本页讲稿</button></details>${state.page===pack.pages.length-1?'<div class="tutor-finish"><h3>把方法用到下一道题</h3><p>巩固、同等、进阶三道原创变式已经准备好。</p><button class="button" type="button" data-finish>开始变式练习 →</button></div>':''}</article></div>`;
    const move=index=>{stopSpeech();state.page=index;frame=0;save();drawPage();root.querySelector('.tutor-slide h2').focus({preventScroll:true});root.querySelector('.tutor-slide').scrollIntoView({block:'start'});};
    body.querySelectorAll('[data-slide]').forEach(button=>button.onclick=()=>move(Number(button.dataset.slide)));
    body.querySelector('[data-prev]').onclick=()=>move(state.page-1);body.querySelector('[data-next]').onclick=()=>move(state.page+1);
    body.querySelector('[data-speak]').onclick=()=>{
      if(!globalThis.speechSynthesis){status('当前浏览器不支持朗读，请展开讲稿阅读。','error');return;}
      if(speechSynthesis.speaking){stopSpeech();return;}
      const speech=new SpeechSynthesisUtterance(p.narration);speech.lang='zh-CN';speech.rate=.95;
      speech.onend=speech.onerror=()=>{const button=root.querySelector('[data-speak]');if(alive&&button)button.textContent='朗读本页讲稿';};
      speechSynthesis.speak(speech);body.querySelector('[data-speak]').textContent='停止朗读';
    };
    const finish=body.querySelector('[data-finish]');if(finish)finish.onclick=()=>{stopSpeech();tab='practice';drawContent();};
    drawVisual(p.visual);
  }
  function drawVisual(visual) {
    const node=root.querySelector('.tutor-visual');if(!visual){node.innerHTML='';return;}
    const current=visual.frames[frame];
    node.innerHTML=`<figure class="tutor-diagram"><figcaption>${esc(visual.title)}</figcaption><div class="tutor-nodes">${visual.nodes.map(n=>`<div class="tutor-node ${current?.active.includes(n.id)?'active':''} ${current?.marked.includes(n.id)?'marked':''}"><strong>${esc(n.label)}</strong><span>${esc(current?.values[n.id] ?? n.detail)}</span></div>`).join('')}</div>${visual.edges.length?`<div class="tutor-edges">${visual.edges.map(e=>`<span>${esc(visual.nodes.find(n=>n.id===e.from).label)} → ${esc(visual.nodes.find(n=>n.id===e.to).label)}</span>`).join('')}</div>`:''}${current?`<p aria-live="polite">${esc(current.caption)}</p><div class="exam-actions"><button class="button secondary" type="button" data-frame-prev ${frame===0?'disabled':''}>上一步图解</button><span>${frame+1} / ${visual.frames.length}</span><button class="button secondary" type="button" data-frame-next ${frame===visual.frames.length-1?'disabled':''}>下一步图解</button></div>`:''}</figure>`;
    if(current){node.querySelector('[data-frame-prev]').onclick=()=>{frame--;drawVisual(visual);};node.querySelector('[data-frame-next]').onclick=()=>{frame++;drawVisual(visual);};}
  }
  function stopSpeech() { if(globalThis.speechSynthesis)speechSynthesis.cancel();const button=root.querySelector('[data-speak]');if(button)button.textContent='朗读本页讲稿'; }
  async function health() {
    const result=await api('/health',undefined,controller.signal);
    if(result.service!=='codearena-learning'||result.physicsSchema!==1)throw Error('共享后台需要更新，请在 GESP 中点击“启动／更新后台”。');
    connectionText=result.configured?`已连接 · ${result.model}`:'已连接 · 尚未配置模型';
    if(alive)updateStatus();
    return result;
  }
  function adopt(value) {
    const pack=checkedPackage(value,q);
    if(state.lesson?.id!==pack.id){state.page=0;state.answers={};frame=0;}
    state.lesson=pack;state.answers=restoreQuestionAnswers(pack.variants,state.answers);
  }
  async function refresh() {
    if(busy)return;
    initializing=true;status('正在连接共享后台…');
    try {
      await health();
      try {adopt(await api('/lessons/'+q.id,undefined,controller.signal));await save();}
      catch(error){if(error.status!==404)throw error;}
      if(alive){drawContent();status(state.lesson?'已加载本题讲解与 3 道原创变式。':'后台已就绪，可以生成本题讲解与变式。','ready');}
    } catch(error) {
      if(alive){connectionText='未连接或需要更新';status((error.status===404?'共享后台需要更新，请在 GESP 中点击“启动／更新后台”。':error.message)+(state.lesson?' 已保留本机课件，可继续学习。':''),'error');}
    } finally {initializing=false;if(alive)updateStatus();}
  }
  async function generate() {
    if(busy||initializing||state.pending)return;
    busy=true;status('正在准备生成讲解与 3 道变式…');
    try {
      if(!(await health()).configured)throw Error('共享后台尚未配置模型，请沿用 GESP 的模型设置完成配置。');
      const job=await api('/lessons',{question:questionContext(q),requirements:state.requirements});
      if(!/^[a-f0-9]{32}$/.test(job.id||''))throw Error('后台任务编号无效，请更新后台。');
      state.pending={id:job.id,endpoint:serviceUrl};await save();
      if(alive){busy=false;await watch();}
    } catch(error){if(alive)status(error.message,'error');}
    finally{busy=false;if(alive)updateStatus();}
  }
  async function watch() {
    if(watching||!state.pending||!alive)return;
    watching=true;busy=true;const pending=state.pending;
    const jobApi=createTutorApi(pending.endpoint);
    try {
      while(alive){
        const job=await jobApi('/jobs/'+pending.id,undefined,controller.signal);
        if(job.kind!=='physics'||job.problemId!==q.id)throw Error('任务与当前物理题不匹配。');
        if(job.status==='failed'){state.pending=null;await save();throw Error(job.message||'生成失败，请重试。');}
        if(job.status==='completed'){
          adopt(await jobApi('/lessons/'+q.id,undefined,controller.signal));state.pending=null;await save();
          if(alive){tab='lesson';drawContent();status('讲解与 3 道原创变式已生成并保存，可以逐页学习。','ready');}
          break;
        }
        status(job.message||'正在生成…');
        await new Promise(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,1200);controller.signal.addEventListener('abort',done,{once:true});});
      }
    } catch(error){if(alive){if(error.status===404){state.pending=null;await save();}status(error.message+(state.pending?' 可点击“继续查询任务”，不会重复生成。':state.lesson?' 已保留上次课件。':''),'error');}}
    finally{watching=false;busy=false;if(alive)updateStatus();}
  }
  render();
  (async()=>{
    try {
      const saved=await store.get(q.id);
      if(saved){
        if(saved.lesson)adopt(saved.lesson);
        state.page=Number.isInteger(saved.page)?saved.page:0;state.requirements=typeof saved.requirements==='string'?saved.requirements.slice(0,2000):'';
        if(state.lesson)state.answers=restoreQuestionAnswers(state.lesson.variants,saved.answers);
        if(/^[a-f0-9]{32}$/.test(saved.pending?.id||''))state.pending={id:saved.pending.id,endpoint:normalizeServiceUrl(saved.pending.endpoint)};
      }
    }catch{storageMessage='本机课件缓存不可用，将尝试从共享后台读取。';}
    if(!alive)return;
    initializing=false;render();
    if(state.pending)await watch();else await refresh();
  })();
  return ()=>{alive=false;controller.abort();stopSpeech();};
}
