import {escapeHtml as esc} from './core.js';
import {createAnalysisStore} from './analysis-store.js';
import {codeHash} from './analysis-policy.js';

export async function requestCodeAnalysis(api,snapshot,gate,{isCurrent=()=>true,onProgress=()=>{},pause=()=>new Promise(r=>setTimeout(r,1000))}={}){
  const expected=await codeHash(snapshot.code);
  let job=await api('/api/code-analysis',{...snapshot,gate});
  const deadline=Date.now()+1500000; // Thinking plus one bounded annotation correction.
  while(!['completed','failed'].includes(job.status)){
    if(!isCurrent())throw Error('分析窗口已关闭');
    if(Date.now()>deadline)throw Error('分析超时，请重新点击代码分析');
    onProgress(job.message||'正在分析…');await pause();job=await api('/api/jobs/'+job.id);
  }
  if(job.status==='failed')throw Error(job.error?.message||'代码分析失败');
  const value=job.result;
  if(value?.sourceHash!==expected||value?.problemId!==snapshot.problem.id||typeof value.summary!=='string'||!Array.isArray(value.issues))throw Error('分析结果与当前代码不匹配，请重试');
  const count=snapshot.code.split('\n').length;
  if(value.issues.some(v=>!Number.isInteger(v.line)||!Number.isInteger(v.endLine)||v.line<1||v.endLine<v.line||v.endLine>count||!['error','warning','suggestion'].includes(v.severity)||['title','reason','suggestion'].some(k=>typeof v[k]!=='string')))throw Error('分析标注格式无效，请重试');
  return value;
}

export function annotatedCodeHtml(code,issues=[]){
  const priority={error:3,warning:2,suggestion:1};
  return code.split('\n').map((text,index)=>{const line=index+1,marked=issues.filter(v=>v.line<=line&&v.endLine>=line).sort((a,b)=>priority[b.severity]-priority[a.severity]);return `<div class="review-line ${marked[0]?.severity||''}" data-review-line="${line}"><button type="button" data-review-jump="${line}" title="${esc(marked.map(v=>v.title).join('；')||'第 '+line+' 行')}">${line}${marked.length?' ●':''}</button><code>${esc(text)||' '}</code></div>`;}).join('');
}

export function createCodeAnalysis({api,getSnapshot,toast,onState=()=>{},store=createAnalysisStore()}){
  let busy=false,epoch=0,passwordPending=null;
  store.cleanHistory().catch(e=>toast(e.message));
  const password=document.createElement('dialog');password.className='code-password-dialog analysis-password-dialog';password.setAttribute('aria-labelledby','analysisPasswordTitle');
  password.innerHTML='<form><div class="dialog-heading"><h2 id="analysisPasswordTitle">代码分析</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div><p class="small muted">输入查看密码后，分析当前代码的错误、风险和修改方向。</p><p class="analysis-gate-progress small"></p><label for="analysisPassword">分析密码</label><input id="analysisPassword" type="password" required maxlength="128" autocomplete="off"><p class="code-password-error" role="alert"></p><div class="dialog-footer"><button type="button" class="ghost">取消</button><button type="submit" class="primary">验证并分析</button></div></form>';
  const dialog=document.createElement('dialog');dialog.className='code-analysis-dialog';dialog.setAttribute('aria-labelledby','analysisTitle');
  dialog.innerHTML='<div class="dialog-heading"><div><span class="eyebrow">CODE ANALYSIS</span><h2 id="analysisTitle">代码分析</h2><p class="small muted analysis-subtitle"></p></div><button class="icon-button" aria-label="关闭分析">×</button></div><p class="analysis-status" role="status"></p><div class="analysis-summary"></div><div class="analysis-columns"><section class="analysis-code" aria-label="当前代码与问题标注"></section><aside class="analysis-findings" aria-label="问题说明"></aside></div><p class="small muted">AI 静态分析 · 标注仅对应本次代码快照，修改后可再次分析；结果需结合运行与评测核对。</p>';
  const history=document.createElement('dialog');history.className='unlock-history-dialog analysis-history-dialog';history.setAttribute('aria-labelledby','analysisHistoryTitle');history.innerHTML='<div class="dialog-heading"><h2 id="analysisHistoryTitle">代码分析记录</h2><button class="icon-button" aria-label="关闭记录">×</button></div><p class="small muted">仅保存分析成功的时间、代码版本和解锁方式。取消、密码错误或请求失败不记录，不保存密码。</p><div class="unlock-history-list"></div>';
  document.body.append(password,dialog,history);
  const $=selector=>dialog.querySelector(selector),input=password.querySelector('input'),error=password.querySelector('[role=alert]');
  function state(value){busy=value;onState(value);}
  function finishPassword(value){const pending=passwordPending;clearInterval(pending?.timer);passwordPending=null;input.value='';error.textContent='';if(password.open)password.close();pending?.resolve(value);}
  for(const b of password.querySelectorAll('[type=button]'))b.onclick=()=>finishPassword(null);
  password.oncancel=e=>{e.preventDefault();finishPassword(null);};password.onclose=()=>{if(passwordPending)finishPassword(null);};
  password.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const pending=passwordPending;if(!pending||pending.checking)return;pending.checking=true;
    const refreshed=await store.progress(pending.problemKey,pending.policy).catch(()=>null);
    if(passwordPending!==pending)return;
    if(refreshed?.eligible){finishPassword({attempts:gateAttempts(refreshed,pending.policy)});return;}const button=password.querySelector('[type=submit]');button.disabled=true;const candidate=input.value;input.value='';
    try{
      let correct=false;
      try{await api('/api/analysis-access',{password:candidate});correct=true;}catch(e){if(e.code!=='analysis_password')throw e;}
      if(passwordPending!==pending)return;
      if(correct)finishPassword(candidate);
      else if(passwordPending===pending){error.textContent='密码不正确，请重新输入。';input.focus();}
    }catch(e){toast(e.message);finishPassword(null);}finally{button.disabled=false;if(passwordPending===pending)pending.checking=false;}
  };
  function gateAttempts(progress,policy){return policy.failedChanges===1?[progress.failures[0]]:[progress.failures[0],...progress.failures.slice(-(policy.failedChanges-1))];}
  function askPassword(progress,problemKey,policy){
    return new Promise(resolve=>{
      const pending={resolve,problemKey,policy,checking:false,timer:null};passwordPending=pending;
      function paint(value){
        if(passwordPending!==pending)return;
        const seconds=Math.ceil(value.remainingMs/1000),minutes=Math.floor(seconds/60),rest=String(seconds%60).padStart(2,'0');
        const left=Math.max(0,policy.failedChanges-value.count);
        const clock=value.count?`剩余时间 ${minutes}:${rest}`:'尚未开始计时';
        const hint=value.eligible?'条件已达成，可以免密分析。':!value.stillFailing?'有效修改后，点击“提交评测”且未通过才开始计时。':left?`还需 ${left} 次有效修改后未通过评测，时间与次数都达标后免密。`:'次数已达标，倒计时结束后可以免密分析。';
        password.querySelector('.analysis-gate-progress').innerHTML=`<span>今天这道题：${value.count} / ${policy.failedChanges} 次有效修改后未通过评测</span><strong class="analysis-countdown" role="timer" aria-live="off">${clock}</strong><span>${hint}</span><small>从当天首次有效修改后未通过评测起计时，每天零点重置。普通运行不计入；仅改空格、注释或重复提交同一版本不计数。</small>`;
        input.hidden=value.eligible;input.required=!value.eligible;password.querySelector('label').hidden=value.eligible;
        password.querySelector('[type=submit]').textContent=value.eligible?'免密分析':'验证并分析';
      }
      paint(progress);input.value='';error.textContent='';password.showModal();input.focus();
      pending.timer=setInterval(async()=>{try{paint(await store.progress(problemKey,policy));}catch(e){if(passwordPending===pending)error.textContent=e.message;}},1000);
    });
  }
  dialog.querySelector('.icon-button').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{epoch++;state(false);});
  history.querySelector('.icon-button').onclick=()=>history.close();
  function jump(line){const target=$(`[data-review-line="${line}"]`);target?.scrollIntoView({block:'center',behavior:'smooth'});$('.review-selected')?.classList.remove('review-selected');target?.classList.add('review-selected');const issue=$(`[data-review-issue="${line}"]`);issue?.scrollIntoView({block:'nearest',behavior:'smooth'});}
  dialog.onclick=event=>{const target=event.target.closest('[data-review-jump]');if(target)jump(Number(target.dataset.reviewJump));};
  function render(code,value){
    $('.analysis-code').innerHTML=annotatedCodeHtml(code,value.issues);$('.analysis-summary').textContent=value.summary;
    const labels={error:'错误',warning:'风险',suggestion:'建议'};
    $('.analysis-findings').innerHTML=value.issues.length?value.issues.map(v=>`<article class="review-finding ${v.severity}" data-review-issue="${v.line}"><button class="text-button" data-review-jump="${v.line}">${labels[v.severity]} · 第 ${v.line}${v.endLine!==v.line?'–'+v.endLine:''} 行</button><h3>${esc(v.title)}</h3><p>${esc(v.reason)}</p><strong>修改方向</strong><p>${esc(v.suggestion)}</p></article>`).join(''):'<p class="small muted">本次未发现可靠的问题标注，可继续使用测试点检查边界情况。</p>';
    $('.analysis-status').textContent=`已完成 · ${value.issues.length} 处标注${value.thinking?' · Thinking':''} · ${value.model||''}`;
  }
  async function open(){
    if(busy)return;const snapshot=getSnapshot();if(!snapshot?.problem||!snapshot.code?.trim()){toast('请先输入需要分析的 C++ 代码');return;}
    snapshot.code=snapshot.code.replace(/\r\n?/g,'\n');if(snapshot.code.length>50000||snapshot.code.split('\n').length>2000){toast('代码分析最多支持 50000 字、2000 行');return;}
    state(true);const token=++epoch,clickedAt=Date.now();
    try{
      const policy=await api('/api/analysis-settings');const progress=await store.progress(snapshot.problem.id,policy);let gate;
      if(epoch!==token)return;
      if(progress.eligible)gate={attempts:gateAttempts(progress,policy)};
      else{const candidate=await askPassword(progress,snapshot.problem.id,policy);if(candidate===null)return;gate=typeof candidate==='string'?{password:candidate}:candidate;}
      if(epoch!==token)return;
      const unlockMethod=gate.attempts?'练习达标免密':'密码验证';
      $('.analysis-subtitle').textContent=snapshot.problem.title+' · 当前代码快照';$('.analysis-status').textContent='正在分析代码…';$('.analysis-summary').textContent='';$('.analysis-code').innerHTML=annotatedCodeHtml(snapshot.code);$('.analysis-findings').textContent='正在检查逻辑、边界和实现方式…';dialog.showModal();
      const result=await requestCodeAnalysis(api,snapshot,gate,{isCurrent:()=>epoch===token&&dialog.open,onProgress:message=>{if(epoch===token)$('.analysis-status').textContent=message;}});
      if(epoch!==token||!dialog.open)return;
      render(snapshot.code,result);
      try{await store.success(snapshot.problem,snapshot.code,{clickedAt,unlockMethod,issueCount:result.issues.length});}catch(e){toast('分析已完成，但记录保存失败：'+e.message);}
    }catch(e){if(epoch===token){if(dialog.open){$('.analysis-status').textContent=e.message;$('.analysis-findings').textContent='分析未完成。关闭窗口后可重试，编辑器中的代码未修改。';}else toast(e.message);}}
    finally{if(epoch===token)state(false);}
  }
  async function showHistory(){const snapshot=getSnapshot();if(!snapshot?.problem)return;const body=history.querySelector('.unlock-history-list');body.textContent='正在读取…';if(!history.open)history.showModal();try{const rows=await store.list(snapshot.problem.id);body.innerHTML=rows.length?`<p class="small">${esc(snapshot.problem.title)} · 共 ${rows.length} 次成功分析</p><ol>${rows.map(row=>`<li><time>${esc(new Date(row.clickedAt).toLocaleString('zh-CN',{hour12:false}))}</time><strong>${esc(row.status)}${row.unlockMethod?' · '+esc(row.unlockMethod):''}</strong><span>代码版本 ${esc(row.codeHash.slice(0,10))}${row.issueCount!=null?' · '+Number(row.issueCount)+' 处标注':''}</span></li>`).join('')}</ol>`:'<p class="muted">本题暂无代码分析记录。</p>';}catch(e){body.textContent=e.message;}}
  function close(){epoch++;finishPassword(null);if(dialog.open)dialog.close();if(history.open)history.close();state(false);}
  return {open,showHistory,close,baseline:(p,code)=>store.baseline(p.id,code).catch(e=>toast(e.message)),attempt:(...args)=>store.attempt(...args).catch(e=>toast(e.message))};
}
