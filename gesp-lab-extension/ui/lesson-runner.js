import {escapeHtml as esc} from './core.js';
import {createLessonDebugger} from './lesson-debugger.js';
import {generateRunCase} from './run-cases.js';

export async function executeLessonCode(sendNative, code, input) {
  const payload={mode:'run',code,input};
  if(!code?.trim())throw Error('本页没有可运行的 C++ 代码');
  if(new TextEncoder().encode(JSON.stringify(payload)).length>210000)throw Error('代码和输入总量过大，请缩小输入');
  const result=await sendNative(payload);
  if(result.error&&!result.status)throw Error(result.error);
  return result;
}

export function executionHtml(data) {
  if(data.status==='CE')return `<p class="chat-error">编译失败，请查看错误位置。</p><pre>${esc(data.compile||data.message||'未返回编译信息')}</pre>`;
  const ok=data.status==='OK';
  return `<span class="status-pill ${ok?'pass':'fail'}">${esc(data.status)}${data.timeMs!=null?' · '+esc(data.timeMs)+' ms':''}</span><p class="case-note">标准输出</p><pre>${esc(data.output||'(无输出)')}</pre>${data.error?`<p class="case-note">标准错误</p><pre>${esc(data.error)}</pre>`:''}${data.message?`<p class="case-note">${esc(data.message)}</p>`:''}`;
}

export function createLessonRunner({sendNative,api,toast,canRun=()=>false,onOpen=()=>{},onChat=()=>{}}) {
  const $=id=>document.getElementById(id);
  let source=null,busy=false;
  const caseStatus=document.createElement('p');caseStatus.id='lessonCaseStatus';caseStatus.className='lesson-case-status';caseStatus.hidden=true;caseStatus.setAttribute('role','status');
  $('lessonStdin').insertAdjacentElement('afterend',caseStatus);
  function showCaseStatus(message,error=false){caseStatus.hidden=!message;caseStatus.textContent=message;caseStatus.classList.toggle('error',error);}
  const debuggerPanel=createLessonDebugger({root:$('lessonDebug'),onState:updateControls});
  function controls(){
    // The constructor calls this once before debuggerPanel is assigned.
    const active=$('lessonDebug')?.dataset.active==='true';
    $('runLessonBtn').disabled=busy||active;$('debugLessonBtn').disabled=busy||active;
    $('changeLessonCase').disabled=busy||active;$('lessonStdin').disabled=busy||active;
  }
  function updateControls({active=false,busy:debugBusy=false}={}){$('lessonDebug').dataset.active=String(active||debugBusy);controls();}
  function visible(open) {
    if(open&&(!source||!canRun(source.lessonId,source.pageIndex))){toast('请先输入密码解锁本页代码');return;}
    if(open)onOpen();
    $('lessonRunPanel').hidden=!open;
    $('toggleLessonRun').setAttribute('aria-expanded',String(open));
    $('lessonRunPanel').closest('.player-layout').classList.toggle('chat-collapsed',!open&&$('pageChat').hidden);
  }
  async function run() {
    if(!source||busy)return;
    if(!canRun(source.lessonId,source.pageIndex)){visible(false);toast('请先输入密码解锁本页代码');return;}
    const selected=source;
    debuggerPanel.stop();$('lessonDebug').hidden=true;
    busy=true;controls();
    $('lessonRunState').textContent='运行中';$('lessonRunOutput').textContent='正在编译并运行本页代码…';
    try {
      const result=await executeLessonCode(sendNative,selected.code,$('lessonStdin').value);
      if(source?.key!==selected.key)return;
      $('lessonRunState').textContent=result.status;
      $('lessonRunOutput').innerHTML=executionHtml(result);
    }catch(error){if(source?.key===selected.key){$('lessonRunState').textContent='未完成';$('lessonRunOutput').textContent=error.message;}}
    finally{busy=false;controls();$('runLessonBtn').textContent='▶ 重新运行';}
  }
  function open(lesson,index) {
    if(!canRun(lesson.id,index)){toast('请先输入密码解锁本页代码');return;}
    if(busy){visible(true);toast('当前代码正在运行，请稍候');return;}
    const page=lesson.pages[index];
    if(!page.code?.trim()){toast('本页没有可运行代码');return;}
    const key=lesson.id+':'+index;
    if(source?.key!==key){debuggerPanel.stop();showCaseStatus('');$('lessonCaseInfo').hidden=true;$('lessonStdin').value=lesson.problem?.sampleInput||(lesson.problem?.kind==='knowledge-topic'?lesson.pages[index]?.examples?.[0]?.input:'')||'';}
    source={key,lessonId:lesson.id,pageIndex:index,code:page.code,title:page.title};
    $('lessonRunPage').textContent=`来自第 ${index+1} / ${lesson.pages.length} 页`;
    $('lessonRunTitle').textContent=page.title;
    $('toggleLessonRun').hidden=false;
    visible(true);run();
  }
  $('runLessonBtn').onclick=run;
  $('debugLessonBtn').onclick=async()=>{
    if(!source||busy||!canRun(source.lessonId,source.pageIndex))return;
    $('lessonRunOutput').textContent='调试已在独立大窗口打开，关闭窗口后可继续运行。';$('lessonRunState').textContent='调试';
    await debuggerPanel.start(source.code,$('lessonStdin').value,source.title);
  };
  $('changeLessonCase').onclick=async()=>{
    if(!source||busy||debuggerPanel.active||!canRun(source.lessonId,source.pageIndex))return;
    const selected=source,oldInput=$('lessonStdin').value;busy=true;controls();$('changeLessonCase').textContent='生成中…';
    showCaseStatus('正在按原题生成新用例…');
    try{
      const value=await generateRunCase(api,selected,oldInput,{isCurrent:()=>source===selected,onProgress:text=>{if(source===selected)showCaseStatus(text);}});
      if(source!==selected)return;
      $('lessonStdin').value=value.input;$('lessonCaseInfo').hidden=false;
      $('lessonCaseInfo').innerHTML=`<p>${esc(value.explanation)}</p><span>AI 预期输出 · 供运行核对</span><pre>${esc(value.expected)}</pre>`;
      $('lessonRunOutput').textContent='已换用例，点击运行或开始调试。';$('lessonRunState').textContent='待运行';
      showCaseStatus('已换成新用例。');
    }catch(error){if(source===selected){showCaseStatus('换用例失败：'+error.message+' 原输入已保留，可再次点击“换个用例”。',true);toast(error.message);}}
    finally{busy=false;controls();$('changeLessonCase').textContent='换个用例';}
  };
  $('lessonStdin').addEventListener('input',()=>{$('lessonCaseInfo').hidden=true;showCaseStatus('');});
  $('closeLessonRun').onclick=()=>{debuggerPanel.stop();visible(false);};
  $('runnerToChat').onclick=()=>{visible(false);onChat();};
  $('toggleLessonRun').onclick=()=>visible($('lessonRunPanel').hidden);
  return {open,hide:()=>visible(false),forgetLesson:id=>{if(source?.lessonId===id){debuggerPanel.close();source=null;visible(false);$('toggleLessonRun').hidden=true;}}};
}
