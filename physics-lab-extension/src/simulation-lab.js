import {World} from './world.js';
import {simulations,initialValues} from './simulations.js';
import {sceneFor,stepPresets} from './simulation-scenes.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null?'—':typeof n==='number'?Number(n.toFixed(3)).toString():String(n);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const animated=new Set(['phase-cycle','diffusion','boiling','stopwatch','speed','friction','inertia','work','circuit','ammeter','voltmeter','ohm','lamp-power','motor','induction','communication','energy-budget']);

export function mountSimulation(root,id,{note='',saveNote,toast,records:initialRecords=[],saveRecords=()=>{}}){
 const def=simulations.find(x=>x.id===id);
 let values=initialValues(def),step=0,records=Array.isArray(initialRecords)?initialRecords.filter(row=>Array.isArray(row)&&row.every(c=>typeof c==='string'||typeof c==='number')).slice(-12):[];
 let world=null,frame=null,playing=false,time=0,last=0,scene=null,disposed=false,recoveryTimer=null;
 root.classList.add('simulation');
 root.innerHTML=`<header class="simulation-heading"><div><span class="eyebrow">3D 实验室</span><h1>${esc(def.title)}</h1><p>${esc(def.description)}</p></div><button class="button secondary" id="expand-experiment" aria-pressed="false" title="铺满页面">⛶ 展开</button></header>
 <nav class="experiment-actions" aria-label="实验操作"><button class="button" id="record-observation">＋ 记录本组</button><button class="button secondary" id="reset-simulation">重做实验</button><button class="button secondary" id="sweep-simulation" ${animated.has(id)?'':'hidden'}>▶ 播放演示</button></nav>
 <div class="simulation-grid"><section class="simulation-stage"><div class="simulation-world"><canvas tabindex="0" aria-label="${esc(def.title)}三维实验，拖动旋转、滚轮或双指缩放，Home 复位"></canvas><div class="world-labels" aria-hidden="true"></div><div class="world-help">拖动旋转 · 滚轮 / 双指缩放</div><div class="world-camera"><button data-camera="closer" aria-label="放大">＋</button><button data-camera="farther" aria-label="缩小">−</button><button data-camera="reset" aria-label="复位视角">↺</button></div><div class="world-notice" role="status" hidden><strong>3D 画面暂不可用</strong><p>此设备未能创建 WebGL 画面，或图形上下文已丢失。</p><button class="button secondary" id="recover-world">恢复 3D 画面</button></div></div><div class="instrument-results" aria-live="polite"></div><p class="experiment-observation" role="status"></p></section>
 <aside class="simulation-controls"><h2>调节与观察</h2><form>${def.controls.map(c=>`<label>${esc(c.label)} <output data-output="${c.key}"></output>${c.options?`<select name="${c.key}">${c.options.map((label,i)=>`<option value="${i}" ${i===c.value?'selected':''}>${esc(label)}</option>`).join('')}</select>`:`<input type="range" name="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">`}</label>`).join('')}</form><p class="model-limit">${esc(def.limit)} 器材尺寸与演示速度为教学呈现，读数按所设条件计算。</p></aside></div>
 <section class="experiment-guide"><h2>分步探究</h2><div class="step-selector">${def.guide.map((_,i)=>`<button data-step="${i}" aria-pressed="${i===0}">${String(i+1).padStart(2,'0')}</button>`).join('')}</div><p id="guide-text"></p><p id="guide-setting" class="muted"></p><details><summary>观察与结论</summary><p id="guide-result"></p></details><div class="button-pair"><button class="button secondary" id="step-prev">← 上一步</button><button class="button secondary" id="step-next">下一步 →</button></div></section>
 <section class="experiment-records"><div class="section-top"><h2>实验记录 <small>最多保留 12 组</small></h2><button class="text-link" id="clear-records">清空记录</button></div><div class="record-table"></div></section><label class="experiment-note">我的结论与疑问<textarea maxlength="2000" rows="4" placeholder="我控制了……，改变了……，观察到……；模型还没有考虑……">${esc(note)}</textarea></label>`;
 const controls=root.querySelector('form'),labelLayer=root.querySelector('.world-labels'),notice=root.querySelector('.world-notice'),play=root.querySelector('#sweep-simulation');
 let canvas=root.querySelector('canvas');
 controls.onsubmit=e=>e.preventDefault();
 function stop(){playing=false;if(frame!==null)cancelAnimationFrame(frame);frame=null;last=0;play.textContent='▶ 播放演示';}
 function createWorld(camera=[.4,.35,6.8],target=[0,1.6,0],reuseContext=true){
  world=new World(canvas,status=>{notice.hidden=status==='ready';play.disabled=status!=='ready';if(status!=='ready')stop();},{reuseContext});
  canvas=world.canvas;world.camera=[...camera];world.target=[...target];world.onDraw=labels;
 }
 createWorld();
 function labels(){
  if(!scene||!world?.ready)return;
  const occupied=[];
  labelLayer.querySelectorAll('span').forEach((node,i)=>{const pos=world.project(scene.labels[i].pos);if(!pos){node.hidden=true;return;}node.hidden=false;const w=Math.min(180,node.offsetWidth||120),h=23;let x=clamp(pos[0]-w/2,8,Math.max(8,canvas.clientWidth-w-8)),y=clamp(pos[1]-h,8,canvas.clientHeight-65);
   for(let j=0;j<5&&occupied.some(r=>x<r.x+r.w&&x+w>r.x&&y<r.y+r.h&&y+h>r.y);j++)y=clamp(y+25,8,canvas.clientHeight-65);
   occupied.push({x,y,w,h});node.style.left=x+'px';node.style.top=y+'px';
  });
 }
 function draw(){
  scene=sceneFor(def,values,def.calculate(values),time);
  if(labelLayer.childElementCount!==scene.labels.length||scene.labels.some((label,i)=>labelLayer.children[i]?.textContent!==label.text))labelLayer.innerHTML=scene.labels.map(label=>`<span>${esc(label.text)}</span>`).join('');
  world.update(scene.items);
 }
 function update(){
  const r=def.calculate(values);draw();
  root.querySelector('.instrument-results').innerHTML=r.metrics.map(([label,n,unit])=>`<div><small>${esc(label)}</small><strong>${esc(fmt(n))}<span> ${esc(unit)}</span></strong></div>`).join('');
  root.querySelector('.experiment-observation').textContent=r.text;root.querySelector('#guide-result').textContent=r.text;
  for(const c of def.controls){controls.elements.namedItem(c.key).value=values[c.key];root.querySelector(`[data-output="${c.key}"]`).textContent=c.options?'':fmt(values[c.key])+' '+c.unit;}
 }
 controls.oninput=e=>{const c=def.controls.find(x=>x.key===e.target.name);if(!c)return;const n=Number(e.target.value);if(!Number.isFinite(n))return;stop();time=0;values[c.key]=c.options?clamp(n,0,c.options.length-1):clamp(n,c.min,c.max);update();};
 function selectStep(index){
  stop();time=0;step=clamp(index,0,def.guide.length-1);values={...initialValues(def),...stepPresets[id][step]};
  root.querySelectorAll('[data-step]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.step)===step)));
  root.querySelector('#guide-text').textContent=def.guide[step];
  root.querySelector('#guide-setting').textContent='本步条件：'+Object.entries(stepPresets[id][step]).map(([key,n])=>{const c=def.controls.find(x=>x.key===key);return c.label+' '+(c.options?c.options[n]:fmt(n)+' '+c.unit);}).join(' · ');
  root.querySelector('#step-prev').disabled=step===0;root.querySelector('#step-next').disabled=step===def.guide.length-1;root.querySelector('.experiment-guide details').open=false;update();
 }
 root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>selectStep(Number(b.dataset.step)));root.querySelector('#step-prev').onclick=()=>selectStep(step-1);root.querySelector('#step-next').onclick=()=>selectStep(step+1);
 function tick(now){if(!playing||disposed)return;if(!last)last=now;if(now-last>=33){time+=Math.min((now-last)/1000,.1);last=now;draw();}frame=requestAnimationFrame(tick);}
 play.onclick=()=>{if(playing){stop();return;}if(!world.ready)return;playing=true;play.textContent='Ⅱ 暂停演示';frame=requestAnimationFrame(tick);};
 root.querySelector('#reset-simulation').onclick=()=>{selectStep(0);world.camera=[.4,.35,6.8];world.draw();};
 root.querySelector('#recover-world').onclick=()=>{
  if(root.querySelector('#recover-world').dataset.reload==='true'){
   try{sessionStorage.setItem('physics-recover-'+id,JSON.stringify({values,step}));}catch{}
   location.reload();return;
  }
  if(recoveryTimer!==null)return;
  stop();const camera=[...world.camera],target=[...world.target];world.dispose();
  const replacement=canvas.cloneNode(false);delete replacement.dataset.rendered;delete replacement.dataset.renderError;
  canvas.replaceWith(replacement);canvas=replacement;createWorld(camera,target,false);draw();
  const button=root.querySelector('#recover-world');let retries=0;
  function finishRecovery(){
   recoveryTimer=null;if(disposed)return;
   if(world.ready){button.disabled=false;button.textContent='恢复 3D 画面';canvas.focus();return;}
   // Drivers can release a lost context asynchronously. Retry the fresh canvas
   // briefly, then leave a manual recovery action if WebGL remains unavailable.
   if(retries++<2){button.disabled=true;button.textContent='正在恢复…';recoveryTimer=setTimeout(()=>{world.init();draw();finishRecovery();},retries*300);}
   else{button.disabled=false;button.textContent='刷新页面恢复';button.dataset.reload='true';}
  }
  finishRecovery();
 };
 root.querySelectorAll('[data-camera]').forEach(button=>button.onclick=()=>{if(button.dataset.camera==='reset'){world.camera=[.4,.35,6.8];world.draw();}else world.zoom(button.dataset.camera==='closer'?.85:1.18);});
 function expanded(value){root.classList.toggle('expanded',value);document.body.classList.toggle('experiment-expanded',value);const button=root.querySelector('#expand-experiment');button.textContent=value?'↙ 收起':'⛶ 展开';button.setAttribute('aria-pressed',String(value));world.draw();}
 root.querySelector('#expand-experiment').onclick=()=>expanded(!root.classList.contains('expanded'));
 const escape=e=>{if(e.key==='Escape'&&root.classList.contains('expanded'))expanded(false);};document.addEventListener('keydown',escape);
 function recordTable(){const columns=[...def.controls.map(c=>c.label+(c.unit?' / '+c.unit:'')),...def.calculate(values).metrics.map(m=>m[0]+(m[2]?' / '+m[2]:''))];root.querySelector('.record-table').innerHTML=records.length?`<table><caption class="sr-only">${esc(def.title)}观测记录</caption><thead><tr><th>组次</th>${columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${records.map((row,i)=>`<tr><th>${i+1}</th>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="muted">先提出预测，调整参数，再点击“记录本组”比较数据。</p>';}
 root.querySelector('#record-observation').onclick=()=>{records.push([...def.controls.map(c=>c.options?c.options[values[c.key]]:fmt(values[c.key])),...def.calculate(values).metrics.map(m=>fmt(m[1]))]);records=records.slice(-12);saveRecords(records);recordTable();toast('已记录这组观察。');};
 root.querySelector('#clear-records').onclick=()=>{records=[];saveRecords(records);recordTable();};root.querySelector('textarea').oninput=e=>saveNote(e.target.value);
 const hide=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hide);
 selectStep(0);recordTable();
 try{
  const key='physics-recover-'+id,saved=JSON.parse(sessionStorage.getItem(key)||'null');sessionStorage.removeItem(key);
  if(saved&&Number.isInteger(saved.step)&&saved.step>=0&&saved.step<def.guide.length&&def.controls.every(c=>typeof saved.values?.[c.key]==='number'&&Number.isFinite(saved.values[c.key])&&saved.values[c.key]>=(c.options?0:c.min)&&saved.values[c.key]<=(c.options?c.options.length-1:c.max))){selectStep(saved.step);values=Object.fromEntries(def.controls.map(c=>[c.key,saved.values[c.key]]));update();}
 }catch{}
 return()=>{disposed=true;stop();clearTimeout(recoveryTimer);world.dispose();document.body.classList.remove('experiment-expanded');document.removeEventListener('visibilitychange',hide);document.removeEventListener('keydown',escape);};
}
