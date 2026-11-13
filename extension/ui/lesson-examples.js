import {lessonProse} from './lesson-prose.js';
import {visualHtml,visualContext} from './visuals.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isDrink=lesson=>lesson.problem?.id==='gesp-2026-09-5-2'||lesson.problem?.title==='饮品调制';
const pageText=page=>[page.title,...(page.content||[])].join(' ');

export function usesOriginalSample(page,lesson={}) {
  if(typeof page.useOriginalSample==='boolean')return page.useOriginalSample;
  if(page.kind==='题目')return true;
  if(['代码','复杂度','总结'].includes(page.kind))return false;
  if(/样例|示例|举例|实例/.test(pageText(page)))return true;
  // Older drink lessons use the original 0/5/10 values in their concept table.
  if(isDrink(lesson)&&page.kind==='知识'&&/偏差/.test(pageText(page))&&page.trace?.rows?.length)return true;
  return false;
}

const number=value=>Number(value.toFixed(3)).toString();
export function drinkExample(input,title='混合示例',source='补充教学示例') {
  const values=String(input).trim().split(/\s+/).map(Number),[n,target]=values;
  if(!Number.isInteger(n)||n<1||n>8||values.length!==2+2*n||values.some(v=>!Number.isFinite(v)))return null;
  const items=Array.from({length:n},(_,i)=>({id:'r'+i,volume:values[2+2*i],sugar:values[3+2*i],used:0}));
  if(target<0||target>200||items.some(r=>r.volume<=0||r.volume>100||r.sugar<0||r.sugar>200))return null;
  const nodes=items.map((r,i)=>({id:r.id,label:`原料 ${i+1}：${r.sugar} 克/升`,detail:`最多 ${r.volume} 升`}));
  nodes.push({id:'total',label:'混合后的总体积',detail:'0 升'});
  let total=0;const frames=[];
  const frame=(caption,active=[])=>frames.push({caption,active,values:Object.fromEntries([...items.map(r=>[r.id,`取 ${number(r.used)} / ${r.volume} 升`]),['total',`${number(total)} 升`]])});
  frame(`目标含糖量 ${target} 克/升。先看各原料最多能取多少。`);
  for(const r of items)if(r.sugar===target){r.used=r.volume;total+=r.volume;frame(`原料含糖量正好为目标，直接取完 ${r.volume} 升。`,[r.id,'total']);}
  const high=items.filter(r=>r.sugar>target).sort((a,b)=>a.sugar-b.sugar),low=items.filter(r=>r.sugar<target).sort((a,b)=>b.sugar-a.sugar);
  if(high.length&&low.length)frame('先选偏差绝对值小的原料。相同的偏差额度可以换取更多体积。',[high[0].id,low[0].id]);
  let h=0,l=0;
  while(h<high.length&&l<low.length){
    const a=high[h],b=low[l],dh=a.sugar-target,dl=target-b.sugar;
    const budget=Math.min((a.volume-a.used)*dh,(b.volume-b.used)*dl);
    const vh=budget/dh,vl=budget/dl;a.used+=vh;b.used+=vl;total+=vh+vl;
    frame(`高糖取 ${number(vh)} 升，低糖取 ${number(vl)} 升：${number(vh)} × ${dh} 与 ${number(vl)} × ${dl} 平衡（体积显示为近似值）。`,[a.id,b.id,'total']);
    if(a.volume-a.used<1e-8)h++;if(b.volume-b.used<1e-8)l++;
  }
  frame(`结束：${high.length&&low.length?'一侧原料已用完，剩余单侧原料不能再加入。':'无法配对的单侧原料不取，保留含糖量正好的原料。'}最大体积 ${total.toFixed(3)} 升。`,['total']);
  return {title,input,output:total.toFixed(3),source,visual:{type:'array',title:'观察取用量与混合结果',nodes,frames}};
}

export function examplesForPage(page,lesson={}) {
  if(Array.isArray(page.examples)&&page.examples.length)return page.examples.slice(0,3).filter(e=>e&&typeof e.input==='string'&&typeof e.output==='string').map(e=>({...e,source:'AI 补充教学示例'}));
  if(!isDrink(lesson))return [];
  if(page.kind==='步骤'||/样例分析|示例推演/.test(page.title||''))return [
    drinkExample(lesson.problem.sampleInput,'原题示例',lesson.problem.sampleLabel||'题目示例'),
    drinkExample('2 5\n1 0\n3 8\n','小数用量'),
    drinkExample('2 5\n1 5\n4 5\n','含糖量全都正好'),
    drinkExample('1 5\n2 8\n','只有高糖原料'),
  ].filter(Boolean);
  if(page.kind==='思路'&&/贪心|排序/.test(pageText(page))){
    const example=drinkExample('3 5\n1 0\n5 6\n1 10\n','为什么先用偏差小的原料？');
    example.explanation='先取 5 升含糖量为 6 的原料，配 1 升含糖量为 0 的原料，共 6 升；若先用含糖量为 10 的原料，只能配成 2 升。';return [example];
  }
  return [];
}

export function examplesHtml(examples,index=0,frame=0,{interactive=false,playing=false}={}) {
  if(!examples.length)return '';
  const example=examples[index]||examples[0],selected=interactive?[example]:examples;
  return `<section class="lesson-examples lesson-sample-reference"><div class="lesson-sample-heading"><h3>换个例子试试看</h3><span>输入、结果与步骤演示</span></div>${interactive&&examples.length>1?`<div class="example-tabs" role="group" aria-label="切换教学示例">${examples.map((item,i)=>`<button type="button" data-example-index="${i}" aria-pressed="${i===index}">${esc(item.title)}</button>`).join('')}</div>`:''}${selected.map(item=>`<div class="example-case"><p class="example-source">${esc(item.source||'补充教学示例')} · ${lessonProse(item.title)}</p><div class="lesson-sample-grid"><div class="lesson-sample-item"><h4>输入</h4><pre class="lesson-sample-value"><code>${esc(item.input)}</code></pre></div><div class="lesson-sample-item"><h4>输出</h4><pre class="lesson-sample-value"><code>${esc(item.output)}</code></pre></div></div>${item.explanation?`<p class="example-explanation">${lessonProse(item.explanation)}</p>`:''}${item.visual?visualHtml(item.visual,interactive?frame:Math.max(0,(item.visual.frames?.length||1)-1),{interactive,playing}).replaceAll('data-visual=','data-example-frame='):''}</div>`).join('')}</section>`;
}

export function createExamplePlayer() {
  const root=document.getElementById('slideContent'),records=new Map();let key=null,timer=null;
  function pause(){clearInterval(timer);timer=null;}
  function render(){const entry=records.get(key),panel=root.querySelector('.lesson-examples');if(entry&&panel)panel.outerHTML=examplesHtml(entry.examples,entry.index,entry.frame,{interactive:true,playing:Boolean(timer)});}
  function setPage(lesson,index){const next=lesson.id+':'+index;if(next!==key)pause();key=next;const examples=examplesForPage(lesson.pages[index],lesson);if(!examples.length)return;if(!records.has(key))records.set(key,{examples,index:0,frame:0});render();}
  root.addEventListener('click',event=>{
    const entry=records.get(key);if(!entry)return;
    const selected=event.target.closest('[data-example-index]');
    if(selected){pause();entry.index=Number(selected.dataset.exampleIndex);entry.frame=0;render();return;}
    const action=event.target.closest('[data-example-frame]')?.dataset.exampleFrame;if(!action)return;
    const last=(entry.examples[entry.index].visual?.frames?.length||1)-1;
    if(action==='play'){if(timer)pause();else{if(entry.frame===last)entry.frame=0;timer=setInterval(()=>{entry.frame++;if(entry.frame>=last)pause();render();},1600);}}
    else{pause();entry.frame=Math.max(0,Math.min(last,entry.frame+(action==='next'?1:-1)));}render();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();render();}});
  return {setPage,pause:()=>{pause();render();},context:(id,index)=>{const entry=records.get(id+':'+index);if(!entry)return '';const example=entry.examples[entry.index];return JSON.stringify({example:example.title,input:example.input,output:example.output,explanation:example.explanation||'',frame:visualContext(example.visual,entry.frame)}).slice(0,2500);}};
}
