import {escapeHtml as esc} from './core.js';
import {createNativeDebugger} from './native-debugger.js';

export function createLessonDebugger({root,mount=document.getElementById('lessonPlayer')||document.body,onState=()=>{},native=createNativeDebugger()}) {
  let source='',sessionId=null,paused=false,busy=false,epoch=0,snapshot=null,breakpoints=[],previous=new Map();
  const dialog=document.createElement('dialog'),titleId=(root.id||'debug-'+crypto.randomUUID())+'Title';dialog.className='lesson-debug-dialog';dialog.setAttribute('aria-labelledby',titleId);
  dialog.innerHTML='<div class="debug-dialog-heading"><div><span class="eyebrow">DEBUG WORKSPACE</span><h2>代码调试</h2><p class="small muted debug-dialog-subtitle"></p></div><button class="icon-button" aria-label="关闭调试">×</button></div>';
  dialog.querySelector('h2').id=titleId;mount.append(dialog);dialog.append(root);
  root.innerHTML='<div class="debug-controls"><button data-step="next" title="执行当前行，不进入函数">单步跳过</button><button data-step="step" title="进入当前行调用的函数">进入</button><button data-step="finish" title="运行到当前函数返回">跳出</button><button data-step="continue">继续</button><button data-stop>停止</button></div><p class="debug-status" role="status"></p><details class="debug-source-details" open><summary>代码与断点（点击行号）</summary><div class="debug-source"></div></details><label class="debug-stack-label">调用栈<select class="debug-stack"></select></label><p class="debug-note">高亮行为下一条待执行语句。未初始化的变量可能显示旧内存值。仅列出当前作用域及原程序全局变量。</p><div class="debug-variables"></div><div class="debug-pagination"></div><details class="debug-output"><summary>程序输出（可能有缓冲）</summary><pre></pre></details>';
  const codeArea=document.createElement('div'),inspector=document.createElement('div'),columns=document.createElement('div');codeArea.className='debug-code-area';inspector.className='debug-inspector';columns.className='debug-columns';
  for(const selector of ['.debug-source-details','.debug-output'])codeArea.append(root.querySelector(selector));
  for(const selector of ['.debug-stack-label','.debug-note','.debug-variables','.debug-pagination'])inspector.append(root.querySelector(selector));
  columns.append(codeArea,inspector);root.append(columns);
  const $=selector=>root.querySelector(selector),status=$('.debug-status');
  const oldDetails=$('.debug-source-details'),codeSection=document.createElement('section');codeSection.className='debug-source-details';
  codeSection.innerHTML='<div class="debug-code-heading"><span class="debug-code-label">代码与断点</span><div><button data-debug-view="focus">放大代码</button><button data-debug-view="wrap" aria-pressed="true">自动换行</button><button data-debug-view="smaller" aria-label="缩小代码字号">A−</button><button data-debug-view="larger" aria-label="增大代码字号">A+</button></div></div>';
  codeSection.append($('.debug-source'));oldDetails.replaceWith(codeSection);$('.debug-source').classList.add('wrapped');let fontSize=13;
  function controls(){for(const el of root.querySelectorAll('button:not([data-debug-view]),select'))el.disabled=busy||!paused;root.querySelector('[data-stop]').disabled=!sessionId&&!busy;onState({active:!!sessionId,busy});}
  function stop(){epoch++;native.close();sessionId=null;paused=false;busy=false;controls();status.textContent='调试已停止';}
  dialog.querySelector('.icon-button').onclick=()=>dialog.close();
  dialog.addEventListener('close',stop);
  function codeView(){
    const lines=source.replace(/\r\n/g,'\n').split('\n');if(lines.at(-1)===''&&lines.length>1)lines.pop();
    $('.debug-code-label').textContent=`完整代码 · ${lines.length} 行 · 点击行号设断点`;
    $('.debug-source').innerHTML=lines.map((line,index)=>`<div class="debug-line${snapshot?.frame?.isUser&&snapshot.frame.line===index+1?' current':''}"><button data-line="${index+1}" class="${breakpoints.includes(index+1)?'breakpoint':''}" aria-label="${breakpoints.includes(index+1)?'删除':'设置'}第 ${index+1} 行断点" aria-pressed="${breakpoints.includes(index+1)}">${index+1}</button><code>${esc(line)||' '}</code></div>`).join('');
  }
  function rowsHtml(rows,changes=false){return rows.map(row=>{
    const key=(snapshot?.frame?.function||'')+':'+row.group+':'+row.name,changed=changes&&previous.has(key)&&previous.get(key)!==row.value;
    if(changes)previous.set(key,row.value);
    const group={argument:'参数',local:'局部',global:'全局',member:'成员'}[row.group]||'';
    const value=row.value==='<unavailable: declaration not reached>'?'尚未执行到声明':row.value;
    return `<div class="debug-variable${changed?' changed':''}"><div class="debug-variable-row"><div class="debug-variable-identity"><strong title="${esc(row.name)} · ${group}">${esc(row.name)}</strong><small title="${esc(row.type)}">${esc(row.type)}</small></div><code class="debug-variable-value" title="${esc(value)}" tabindex="0">${esc(value)}</code><div class="debug-variable-actions">${row.expandable?`<button data-children="${esc(row.id)}" aria-expanded="false" title="展开 ${esc(row.name)} 的成员">展开</button>`:''}${row.address?`<button class="debug-address" data-memory="${esc(row.id)}" title="${esc(row.address)} · 查看内存" aria-label="查看 ${esc(row.name)} 的内存，地址 ${esc(row.address)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4M9 9h6v6H9z"/></svg></button>`:''}</div></div><div class="debug-child-list"></div><pre class="debug-memory" hidden></pre></div>`;
  }).join('');}
  function render(result){
    snapshot=result;
    if(result.status==='CE'){status.textContent='编译失败';$('.debug-variables').textContent=result.compile;sessionId=null;paused=false;native.close();return;}
    if(result.status==='exited'){status.textContent='程序已结束';sessionId=null;paused=false;native.close();$('.debug-output pre').textContent=result.output||result.stderr||'(无输出)';$('.debug-output').open=true;return;}
    sessionId=result.sessionId;paused=true;breakpoints=result.breakpoints||[];
    status.textContent=(result.signal?'收到信号 '+result.signal+'；':'')+(result.frame?.isUser?'暂停在第 '+result.frame.line+' 行':'当前位于 '+result.frame?.file+'，可点“跳出”返回');
    $('.debug-stack').innerHTML=result.frames.map(f=>`<option value="${f.level}" ${f.level===result.frame.level?'selected':''}>${f.level} · ${esc(f.function)} · ${esc(f.file)}:${f.line}</option>`).join('');
    $('.debug-variables').innerHTML=rowsHtml(result.variables,true)||'<p class="small muted">此处没有可读取的变量。</p>';
    $('.debug-pagination').innerHTML=`<span>变量 ${result.offset+1 > result.total?0:result.offset+1}–${Math.min(result.offset+80,result.total)} / ${result.total}</span>${result.offset?`<button data-offset="${Math.max(0,result.offset-80)}">上一批</button>`:''}${result.more?`<button data-offset="${result.offset+80}">下一批</button>`:''}`;
    $('.debug-output pre').textContent=result.output||result.stderr||'(暂无输出)';codeView();
    const line=$('.debug-line.current'),box=$('.debug-source');if(line)box.scrollTop=line.offsetTop-box.clientHeight/2;
  }
  async function perform(fn,apply=render){
    if(busy)return;const token=epoch;busy=true;controls();
    try{const result=await fn();if(token===epoch)apply(result);}
    catch(error){if(token===epoch){status.textContent=error.message;sessionId=null;paused=false;native.close();}}
    finally{if(token===epoch){busy=false;controls();}}
  }
  async function start(code,input,title=''){
    stop();source=code;snapshot=null;breakpoints=[];previous.clear();root.hidden=false;
    $('.debug-variables').replaceChildren();$('.debug-stack').replaceChildren();$('.debug-pagination').replaceChildren();$('.debug-output pre').textContent='(暂无输出)';
    dialog.querySelector('.debug-dialog-subtitle').textContent=title;
    status.textContent='正在编译并启动调试…';codeView();if(!dialog.open)dialog.showModal();await perform(()=>native.start(code,input));
  }
  root.onclick=event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.debugView){
      const action=button.dataset.debugView;
      if(action==='focus'){const focused=columns.classList.toggle('code-focused');button.textContent=focused?'显示变量':'放大代码';}
      if(action==='wrap'){const wrapped=$('.debug-source').classList.toggle('wrapped');button.setAttribute('aria-pressed',String(wrapped));}
      if(action==='smaller'||action==='larger'){fontSize=Math.max(10,Math.min(20,fontSize+(action==='larger'?1:-1)));root.style.setProperty('--debug-code-font',fontSize+'px');}
      return;
    }
    if(button.hasAttribute('data-stop')){stop();return;}
    if(button.dataset.step)return perform(()=>native.request({mode:'debug_step',sessionId,action:button.dataset.step}));
    if(button.dataset.line){const line=Number(button.dataset.line),lines=breakpoints.includes(line)?breakpoints.filter(n=>n!==line):[...breakpoints,line];return perform(()=>native.request({mode:'debug_breakpoints',sessionId,lines}),result=>{breakpoints=result.breakpoints;codeView();});}
    if(button.dataset.offset)return perform(()=>native.request({mode:'debug_snapshot',sessionId,frame:snapshot.frame.level,offset:Number(button.dataset.offset)}));
    if(button.dataset.memory){
      const pre=button.closest('.debug-variable').querySelector('.debug-memory');
      if(!pre.hidden){pre.hidden=true;return;}
      return perform(()=>native.request({mode:'debug_memory',sessionId,variableId:button.dataset.memory}),result=>{pre.hidden=false;pre.textContent=`${result.size} 字节${result.truncated?'，显示前 64 字节':''}\n${result.bytes}`;});
    }
    if(button.dataset.children){
      const target=button.closest('.debug-variable').querySelector('.debug-child-list');
      if(button.getAttribute('aria-expanded')==='true'){target.replaceChildren();button.setAttribute('aria-expanded','false');button.textContent='展开';return;}
      return perform(()=>native.request({mode:'debug_children',sessionId,variableId:button.dataset.children,offset:Number(button.dataset.childOffset||0)}),result=>{target.innerHTML=rowsHtml(result.variables)+ (result.more?`<button data-children="${esc(result.id)}" data-child-offset="${result.offset+80}">后 80 项</button>`:'');button.setAttribute('aria-expanded','true');button.textContent='收起';});
    }
  };
  $('.debug-stack').onchange=event=>perform(()=>native.request({mode:'debug_snapshot',sessionId,frame:Number(event.target.value)}));
  addEventListener('pagehide',stop);
  controls();return {start,stop,close:()=>{stop();if(dialog.open)dialog.close();},get active(){return !!sessionId||busy;}};
}
