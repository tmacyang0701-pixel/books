import {createUnlockHistory} from './unlock-history.js';
// Access stays in memory; history is independently persisted by original question.
const PASSWORD_SHA256='d9c3348b148dc5dac121cb45097d5ee87b431e395b065ae6f5a2997fb598a014';
const pageKey=(lessonId,index)=>JSON.stringify([lessonId,index]);

export class CodeAccessState {
  constructor(){this.pages=new Set();}
  has(lessonId,index){return this.pages.has(pageKey(lessonId,index));}
  async unlock(password,pages,isCurrent=()=>true){
    if(typeof password!=='string'||!password)return false;
    const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(password));
    const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==PASSWORD_SHA256||!isCurrent())return false;
    for(const [lessonId,index] of pages)this.pages.add(pageKey(lessonId,index));
    return true;
  }
  lock(lessonId,index){this.pages.delete(pageKey(lessonId,index));}
  forgetLesson(lessonId){for(const key of this.pages)if(JSON.parse(key)[0]===lessonId)this.pages.delete(key);}
}

export function createCodeAccess({toast=()=>{}}={}){
  const history=createUnlockHistory();
  const state=new CodeAccessState(),dialog=document.createElement('dialog');
  dialog.className='code-password-dialog';
  dialog.setAttribute('aria-labelledby','codePasswordTitle');
  dialog.innerHTML='<form><div class="dialog-heading"><h2 id="codePasswordTitle">查看完整代码</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div><p class="code-password-description small muted"></p><label for="lessonCodePassword">查看密码</label><input id="lessonCodePassword" name="password" type="password" required maxlength="128" autocomplete="off" spellcheck="false" aria-describedby="codePasswordError"><p id="codePasswordError" class="code-password-error" role="alert"></p><div class="dialog-footer"><button type="button" class="ghost">取消</button><button type="submit" class="primary">验证并显示</button></div></form>';
  document.getElementById('lessonPlayer').append(dialog);
  const form=dialog.querySelector('form'),input=dialog.querySelector('input'),error=dialog.querySelector('[role=alert]'),submit=dialog.querySelector('[type=submit]');
  let pending=null;
  function finish(value){const request=pending;pending=null;input.value='';error.textContent='';input.removeAttribute('aria-invalid');if(dialog.open)dialog.close();request?.resolve(value);}
  for(const button of dialog.querySelectorAll('[type=button]'))button.onclick=()=>finish(false);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
  dialog.addEventListener('close',()=>{if(!dialog.open)finish(false);});
  form.onsubmit=async event=>{
    event.preventDefault();const request=pending;if(!request||request.checking)return;
    request.checking=true;submit.disabled=true;error.textContent='';
    const password=input.value;input.value='';
    try{
      const accepted=await state.unlock(password,request.pages,()=>pending===request&&dialog.open);
      if(pending!==request)return;
      if(accepted){
        try{await history.record(request.lesson,request.pages.map(([,index])=>index));}
        catch(error){toast('代码已解锁，但'+error.message);}
        if(pending===request)finish(true);
      }
      else{error.textContent='密码不正确，请重新输入。';input.setAttribute('aria-invalid','true');input.focus();}
    }catch{if(pending===request)error.textContent='暂时无法验证密码，请刷新页面后重试。';}
    finally{request.checking=false;if(!pending||pending===request)submit.disabled=false;}
  };
  function ensure(pages,description,lesson){
    const locked=pages.filter(([id,index])=>!state.has(id,index));
    if(!locked.length)return Promise.resolve(true);
    if(pending)return Promise.resolve(false);
    return new Promise(resolve=>{pending={pages:locked,lesson,resolve,checking:false};input.value='';error.textContent='';submit.disabled=false;dialog.querySelector('.code-password-description').textContent=description;dialog.showModal();input.focus();});
  }
  return {
    has:(id,index)=>state.has(id,index),
    ensure:(lesson,index)=>ensure([[lesson.id,index]],'输入密码后显示本页完整 C++ 代码，并可运行示例。刷新页面后会重新锁定。',lesson),
    ensureLesson:lesson=>ensure(lesson.pages.flatMap((page,index)=>page.code?.trim()?[[lesson.id,index]]:[]),'导出的 HTML 包含完整 C++ 代码，请先输入查看密码。',lesson),
    showHistory:history.show,
    lock:(id,index)=>state.lock(id,index),
    forgetLesson:id=>{if(pending?.pages.some(([lessonId])=>lessonId===id))finish(false);state.forgetLesson(id);}
  };
}
