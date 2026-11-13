import {escapeHtml as esc} from './core.js';

export function practiceCandidates(groups,query='',level=''){
  const seen=new Set(),term=query.trim().normalize('NFKC').toLowerCase();
  return groups.flat().filter(p=>{
    if(!p?.id||p.kind==='knowledge-topic'||seen.has(p.id))return false;
    seen.add(p.id);
    return (!level||Number(p.level)===Number(level))&&(!term||[p.title,...(p.tags||[])].join(' ').normalize('NFKC').toLowerCase().includes(term));
  });
}

export function createPracticePicker({getGroups,onSelect}){
  const dialog=document.createElement('dialog');dialog.className='practice-picker';
  dialog.setAttribute('aria-label','切换练习题目');
  dialog.innerHTML='<div class="dialog-heading"><h2>切换题目</h2><button class="icon-button" type="button" aria-label="关闭">×</button></div><div class="practice-picker-filters"><input type="search" aria-label="搜索题目名称或知识点" placeholder="搜索题目名称、知识点"><select aria-label="按等级筛选"><option value="">全部等级</option>'+Array.from({length:8},(_,i)=>`<option value="${i+1}">GESP ${i+1} 级</option>`).join('')+'</select></div><p class="small muted" role="status"></p><div class="practice-picker-list"></div>';
  document.body.append(dialog);
  const search=dialog.querySelector('input'),level=dialog.querySelector('select'),list=dialog.querySelector('.practice-picker-list'),status=dialog.querySelector('[role=status]');
  let current='',busy=false,epoch=0;
  function render(){const rows=practiceCandidates(getGroups(),search.value,level.value);status.textContent=`找到 ${rows.length} 道题目`;list.innerHTML=rows.map(p=>`<button type="button" data-problem="${esc(p.id)}" aria-pressed="${p.id===current}"><strong>${esc(p.title)}</strong><span>GESP ${esc(p.level)} 级 · ${esc((p.tags||[]).join(' · '))}${p.id===current?' · 当前题目':''}</span></button>`).join('')||'<p class="muted">没有匹配题目，请调整关键词或等级。</p>';}
  search.oninput=level.onchange=render;
  dialog.querySelector('.icon-button').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{epoch++;document.getElementById('switchPracticeProblem')?.focus();});
  list.onclick=async event=>{
    const button=event.target.closest('[data-problem]');if(!button||busy)return;
    const selected=practiceCandidates(getGroups()).find(p=>p.id===button.dataset.problem);if(!selected)return;
    const token=epoch;busy=true;status.textContent='正在加载题目…';button.disabled=true;
    try{await onSelect(selected,()=>token===epoch&&dialog.open);if(token===epoch)dialog.close();}
    catch(error){if(token===epoch)status.textContent=error.message;}
    finally{busy=false;button.disabled=false;}
  };
  return {open(problem){current=problem?.id||'';search.value='';level.value='';epoch++;render();dialog.showModal();search.focus();}};
}
