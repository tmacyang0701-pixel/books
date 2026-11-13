import {executeLessonCode,executionHtml} from './lesson-runner.js';
import {escapeHtml as esc} from './core.js';
export const normalizeLabOutput=value=>String(value??'').replace(/\r\n/g,'\n').trimEnd();
export function labResult(data,input,lab){
  if(data.status!=='OK')return executionHtml(data);
  const sameInput=normalizeLabOutput(input)===normalizeLabOutput(lab.input),matches=normalizeLabOutput(data.output)===normalizeLabOutput(lab.expectedOutput);
  return `<p class="lab-verdict ${sameInput&&matches?'pass':''}">${sameInput?(matches?'✓ 输出与本例一致':'输出与本例预期不同，请检查语句和变量变化'):'你修改了输入，下面展示实际运行结果'}</p>${executionHtml(data)}<p class="small muted">${sameInput?'仅核对当前示例，不代表所有情况正确。':'预期输出只对应原示例输入。'}</p>`;
}
export function createSyntaxLab({root,sendNative,toast}){
  let active=null,busy=false;const records=new Map();
  const storageKey=key=>'ca-syntax-lab-'+key;
  function save(){if(!active)return;try{localStorage.setItem(storageKey(active.key),JSON.stringify({code:active.code,input:active.input}));root.querySelector('[data-lab-save]').textContent='已保存';}catch{root.querySelector('[data-lab-save]').textContent='保存失败，请复制保留代码';}}
  function controls(){const run=root.querySelector('[data-lab-run]');if(run){run.disabled=busy;run.textContent=busy?'正在运行…':'▶ 运行我的代码';}}
  function paint(){if(!active||root.dataset.labKey!==active.key)return;const output=root.querySelector('[data-lab-result]');if(!output)return;const result=active.result;if(result&&result.code===active.code&&result.input===active.input)output.innerHTML=result.html;else output.textContent=busy?'正在编译运行，请稍候…':result?'代码或输入已修改，请重新运行当前版本。':'补写或修改代码后，点击运行，观察输出。';controls();}
  function setPage(lesson,index){
    active=null;root.dataset.labKey='';const lab=lesson.pages[index]?.lab,code=root.querySelector('[data-lab-code]'),input=root.querySelector('[data-lab-input]');if(!lab||!code||!input)return;
    const key=lesson.id+':'+index;let row=records.get(key);
    if(!row){row={key,lessonId:lesson.id,lab,code:lab.starterCode,input:lab.input};try{const draft=JSON.parse(localStorage.getItem(storageKey(key)));if(typeof draft?.code==='string'&&draft.code.length<=50000&&typeof draft.input==='string'&&draft.input.length<=10000){row.code=draft.code;row.input=draft.input;}}catch{}records.set(key,row);}
    active=row;root.dataset.labKey=key;code.value=row.code;input.value=row.input;paint();
  }
  root.addEventListener('input',event=>{if(!active)return;if(event.target.matches('[data-lab-code]'))active.code=event.target.value;else if(event.target.matches('[data-lab-input]'))active.input=event.target.value;else return;save();paint();});
  root.addEventListener('keydown',event=>{if(event.key!=='Tab'||!event.target.matches('[data-lab-code]'))return;event.preventDefault();const field=event.target;field.setRangeText('    ',field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));});
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||!active)return;
    if(button.hasAttribute('data-lab-reset')){active.code=active.lab.starterCode;active.input=active.lab.input;delete active.result;root.querySelector('[data-lab-code]').value=active.code;root.querySelector('[data-lab-input]').value=active.input;save();paint();return;}
    if(!button.hasAttribute('data-lab-run')||busy)return;
    const selected=active,code=selected.code,input=selected.input;busy=true;controls();root.querySelector('[data-lab-result]').textContent='正在编译并运行你写的代码…';
    try{const data=await executeLessonCode(sendNative,code,input);selected.result={code,input,html:labResult(data,input,selected.lab),summary:String(data.output||data.compile||data.error||data.status).slice(0,1200)};}
    catch(error){selected.result={code,input,html:`<p class="chat-error">${esc(error.message)}</p>`,summary:error.message};}
    finally{busy=false;paint();controls();}
  });
  return {setPage,context:(id,index)=>active?.key===id+':'+index?`学生正在编辑本页动手实验：${active.lab.task}\n当前代码：\n${active.code.slice(0,3000)}\n输入：${active.input.slice(0,500)}\n${active.result?.code===active.code&&active.result?.input===active.input?'实际运行结果：'+active.result.summary:'当前版本尚未运行'}`:'',forgetLesson:id=>{for(const [key,row] of records)if(row.lessonId===id)records.delete(key);if(active?.lessonId===id)active=null;}};
}
