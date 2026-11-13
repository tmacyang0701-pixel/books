(()=>{
 'use strict';
 const $=id=>document.getElementById(id),nav=window.TrainingNavigation;
 const meta={
  digits:{name:'倒序数字',icon:'↶',title:'看一遍，倒着记。',description:'数字会逐个出现，记住后，按相反顺序输入。每轮有 3 组数字。',instruction:'观察时不需操作。数字消失后，按最后一个到第一个的顺序输入。',scoring:'按倒序后每一位数字的位置计分，正确位数 ÷ 总位数 × 100，空缺不计分。'},
  words:{name:'词语记忆',icon:'❋',title:'留住那些见过的词。',description:'先观察一组词语，再从混合选项中找回刚才见过的词。',instruction:'先记住学习词；学习结束后，只选择刚才出现过的词语，不必记住顺序。',scoring:'每记住一个词计 1 分，每误选一个干扰词扣 1 分，再折算为百分制，最低 0 分。'},
  switch:{name:'规则切换',icon:'⇄',title:'换个规则，再做选择。',description:'按每题显示的规则作答：单数或双数、数值大小，或是否为 3 的倍数。',instruction:'每题先看规则，再判断数字。点击按钮，或按键盘 ← / →（也可按 1 / 2）。',scoring:'正确题数 ÷ 总题数 × 100。每题单独计时，错误或超时不计分。'}
 };
 let kind='digits',level=1,state='ready',session=null,task=null,interval=0,epoch=0,controller=null,round=0,responses=[],selected=new Set(),trialStarted=0,prior=null,lastGrade=null,result=null;
 let history=[],levels={digits:1,words:1,switch:1};
 try{const data=JSON.parse(localStorage.getItem('number-garden-gym-v1')||'[]');if(Array.isArray(data))history=data.filter(r=>r&&meta[r.kind]&&Number.isInteger(r.level)&&r.level>=1&&r.level<=10&&Number.isFinite(r.score)&&r.score>=0&&r.score<=100&&Number.isFinite(r.at)).slice(0,200);const saved=JSON.parse(localStorage.getItem('number-garden-gym-levels')||'{}');for(const key of Object.keys(levels))if(Number.isInteger(saved[key])&&saved[key]>=1&&saved[key]<=10)levels[key]=saved[key];}catch{}
 const busy=()=>!['ready','done','error'].includes(state);
 const timed=()=>['study','answer','switch','feedback'].includes(state);
 function status(text,error=false){$('gymStatus').textContent=text;$('gymStatus').classList.toggle('gym-status-error',error);}
 function setState(value){state=value;nav.lock('gym',busy());$('gymStart').disabled=busy();$('gymStart').textContent=value==='loading'?'✧ 正在按级别出题…':value==='done'?'✧ 换一组新题再练':'✧ AI 出题，开始训练';for(const b of $('gymLevels').children)b.disabled=busy();$('gymEnd').hidden=!busy()||value==='grading';$('gymEnd').textContent=value==='loading'?'取消出题':'结束本轮并查看结果';$('gymRetry').hidden=value!=='error'||!lastGrade;$('gymPause').hidden=!timed()&&value!=='paused';$('gymPause').textContent=value==='paused'?'▷ 继续':'Ⅱ 暂停';$('gymBadge').textContent=value==='loading'?'正在生成新题':value==='grading'?'正在核对答案':value==='paused'?'已暂停':`Lv. ${level} · AI 出题`;}
 function params(){if(kind==='digits')return {span:level+2,flashMs:1000-level*60,answerSeconds:Math.max(14,30-level),rounds:3};if(kind==='words')return {count:level+3,studySeconds:14-Math.floor(level*.6),answerSeconds:55-level*2};return {count:8+level*2,rules:level<=3?1:level<=6?2:3,responseMs:8000-level*500};}
 function rememberLevel(){levels[kind]=level;try{localStorage.setItem('number-garden-gym-levels',JSON.stringify(levels));}catch{}}
 function renderHistory(){
  const rows=history.filter(r=>r.kind===kind&&r.level===level),best=rows.length?Math.max(...rows.map(r=>r.score)):null;$('gymBest').replaceChildren(document.createTextNode(best===null?'—':best));if(best!==null){const small=document.createElement('small');small.textContent='分 · Lv. '+level;$('gymBest').append(small);}
  const el=$('gymRecords');el.replaceChildren();const recent=history.filter(r=>r.kind===kind).slice(0,3);el.className=recent.length?'':'record-empty';if(!recent.length)el.textContent='完成一轮，留下你的第一份记录。';
  for(const r of recent){const row=document.createElement('div'),label=document.createElement('span'),small=document.createElement('small'),b=document.createElement('b');row.className='stroop-record';label.textContent=`${meta[r.kind].name} · Lv. ${r.level}`;small.textContent=new Date(r.at).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});b.textContent=r.score+'分';label.append(small);row.append(label,b);el.append(row);}
 }
 function configure(){
  clearInterval(interval);task=null;session=null;lastGrade=null;result=null;round=0;responses=[];selected=new Set();$('gymPauseOverlay').hidden=true;$('gymResults').hidden=true;$('gymTask').hidden=true;$('gymTask').replaceChildren();$('gymWelcome').hidden=false;$('gymWelcome').classList.remove('loading');$('gymName').textContent=meta[kind].name;$('gymDescription').textContent=meta[kind].description;$('gymBoardTitle').textContent=meta[kind].name+'练习';$('gymInstruction').textContent=meta[kind].instruction;$('gymScoring').textContent=meta[kind].scoring;$('gymWelcomeIcon').textContent=meta[kind].icon;$('gymWelcomeTitle').textContent=meta[kind].title;$('gymWelcomeText').textContent=meta[kind].description;$('gymLevelValue').textContent='Lv. '+level;$('gymLevelBand').textContent=level<=3?'轻松起步':level<=6?'逐步进阶':'专注挑战';$('gymTimer').textContent='—';$('gymRound').textContent='—';$('gymScore').textContent='—';$('gymTimerLabel').textContent='阶段倒计时';$('gymRoundLabel').textContent='本轮进度';$('gymProgress').style.width='0';
  for(const b of $('gymLevels').children){const active=Number(b.dataset.level)===level;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  const cfg=params(),specs=kind==='digits'?[['数字长度',cfg.span+' 位'],['每个数字',cfg.flashMs/1000+' 秒'],['每轮组数','3 组'],['每组作答',cfg.answerSeconds+' 秒']]:kind==='words'?[['学习词数',cfg.count+' 个'],['混合选项',cfg.count*2+' 个'],['观察时间',cfg.studySeconds+' 秒'],['选择时间',cfg.answerSeconds+' 秒']]:[['每轮题数',cfg.count+' 题'],['规则种类',cfg.rules+' 种'],['每题时限',cfg.responseMs/1000+' 秒'],['作答方式','左右选择']];
  $('gymSpec').replaceChildren();for(const [label,value]of specs){const row=document.createElement('div'),span=document.createElement('span'),b=document.createElement('b');span.textContent=label;b.textContent=value;row.append(span,b);$('gymSpec').append(row);}
  setState('ready');status('选择级别，开始一小段练习。');renderHistory();rememberLevel();
 }
 async function api(path,body,signal){
  let response;try{response=await fetch('/api/gym/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal||AbortSignal.timeout(20000)});}catch(error){if(error.name==='AbortError')throw error;throw new Error('连接超时，请检查网络后重试。');}
  let data;try{data=await response.json();}catch{throw new Error('无法读取训练服务响应，请刷新页面确认登录状态。');}if(!response.ok)throw new Error(data.error||'训练服务暂时不可用，请重试。');return data;
 }
 function showTask(){ $('gymWelcome').hidden=true;$('gymTask').hidden=false;$('gymTask').replaceChildren(); }
 function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function button(text,fn,className='start'){const b=node('button',className,text);b.onclick=fn;return b;}
 function schedule(callback,ms){task={callback,due:performance.now()+ms};tick();}
 function tick(){if(!task||state==='paused')return;const remaining=Math.max(0,task.due-performance.now());$('gymTimer').textContent=(remaining/1000).toFixed(1)+'s';if(remaining<=0){const run=task.callback;task=null;run();}}
 function digitStudy(){
  showTask();setState('study');$('gymRound').textContent=`${round+1} / 3`;$('gymTimerLabel').textContent='数字展示';status('看清每个数字，记住顺序。');
  const display=node('div','gym-digit',''),sub=node('p','gym-subtitle','');$('gymTask').append(display,sub);
  const show=i=>{if(i>=session.cfg.span){digitAnswer();return;}display.textContent=session.sequences[round][i];sub.textContent=`第 ${i+1} / ${session.cfg.span} 个数字`;$('gymProgress').style.width=`${(round+i/session.cfg.span)/3*100}%`;schedule(()=>{display.textContent='·';schedule(()=>show(i+1),session.cfg.gapMs);},session.cfg.flashMs);};show(0);
 }
 function digitAnswer(){
  showTask();setState('answer');$('gymTimerLabel').textContent='倒序作答';status('数字已隐藏，请从最后一位开始倒着输入。');
  const hint=node('p','gym-word-hint',`请输入刚才 ${session.cfg.span} 位数字的倒序，例如看到 1、2、3，就输入 321。`),input=node('input','gym-digit-input');input.id='gymDigitInput';input.type='text';input.inputMode='numeric';input.autocomplete='off';input.maxLength=session.cfg.span;input.setAttribute('aria-label','输入倒序数字');input.placeholder='倒序输入';input.addEventListener('input',()=>{input.value=input.value.replace(/[^0-9]/g,'').slice(0,session.cfg.span);});input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submitDigit();}};
  const keypad=node('div','gym-keypad');for(const digit of ['1','2','3','4','5','6','7','8','9','0','⌫','清空']){const key=button(digit,()=>{if(state!=='answer')return;if(digit==='⌫')input.value=input.value.slice(0,-1);else if(digit==='清空')input.value='';else if(input.value.length<session.cfg.span)input.value+=digit;},'gym-key');keypad.append(key);}
  $('gymTask').append(hint,input,keypad,button('提交这一组 →',submitDigit));schedule(submitDigit,session.cfg.answerSeconds*1000);if(matchMedia('(min-width:671px)').matches)input.focus({preventScroll:true});
 }
 function submitDigit(){if(state!=='answer')return;task=null;responses[round]=$('gymDigitInput').value;round++;$('gymProgress').style.width=round/3*100+'%';if(round===3){void submit();return;}showTask();setState('between');$('gymTimer').textContent='—';$('gymTask').append(node('div','gym-digit','✓'),node('p','gym-subtitle',`第 ${round} 组答案已记录，准备下一组。`),button(`开始第 ${round+1} 组 →`,digitStudy));status('每组答案将在整轮结束后统一核对。');}
 function wordStudy(){
  showTask();setState('study');$('gymTimerLabel').textContent='观察学习词';$('gymRound').textContent=session.cfg.count+' 词';const grid=node('div','gym-word-grid');for(const word of session.targets)grid.append(node('div','gym-word',word));$('gymTask').append(node('p','gym-word-hint','记住这些词，稍后从混合选项中找回它们。'),grid,button('记好了，开始选择 →',wordAnswer));status('观察词语，注意它们之间的区别。');schedule(wordAnswer,session.cfg.studySeconds*1000);
 }
 function wordAnswer(){
  if(state!=='study')return;task=null;showTask();setState('answer');selected=new Set();$('gymTimerLabel').textContent='选择学习词';$('gymProgress').style.width='50%';const hint=node('p','gym-word-hint',`已选 0 / ${session.cfg.count} 个，最多选择 ${session.cfg.count} 个。`),grid=node('div','gym-word-grid');
  for(const word of session.choices){const b=button(word,()=>{if(state!=='answer')return;if(selected.has(word))selected.delete(word);else if(selected.size<session.cfg.count)selected.add(word);else{status(`最多选 ${session.cfg.count} 个，可以先取消一个再换选。`);return;}b.classList.toggle('selected',selected.has(word));b.setAttribute('aria-pressed',String(selected.has(word)));hint.textContent=`已选 ${selected.size} / ${session.cfg.count} 个，点击可取消。`;},'gym-word');b.setAttribute('aria-pressed','false');grid.append(b);}
  $('gymTask').append(hint,grid,button('确认选择并查看结果 →',()=>void submit()));status('只选刚才出现过的词，误选会扣分。');schedule(()=>void submit(),session.cfg.answerSeconds*1000);
 }
 function ruleLabels(rule){return rule==='parity'?['单数','双数']:rule==='magnitude'?[`大于 ${session.cfg.threshold}`,`不大于 ${session.cfg.threshold}`]:['3 的倍数','非 3 的倍数'];}
 function switchTrial(){
  if(round>=session.trials.length){void submit();return;}showTask();setState('switch');const trial=session.trials[round],labels=ruleLabels(trial.rule),rule=node('div','gym-rule-label',trial.rule==='parity'?'当前规则 · 判断单 / 双数':trial.rule==='magnitude'?`当前规则 · 与 ${session.cfg.threshold} 比较`:'当前规则 · 判断是否为 3 的倍数');rule.dataset.rule=trial.rule;const choices=node('div','gym-rule-buttons');labels.forEach((text,i)=>{const b=button(text,()=>answerRule(i),'gym-rule-answer');b.dataset.answer=i;b.append(node('small','',i?'→ / 2':'← / 1'));choices.append(b);});$('gymTask').append(rule,node('div','gym-switch-value',trial.value),choices);$('gymRound').textContent=`${round+1} / ${session.cfg.count}`;$('gymTimerLabel').textContent='本题剩余';$('gymProgress').style.width=round/session.cfg.count*100+'%';status('先确认当前规则，再做选择。');trialStarted=performance.now();schedule(()=>answerRule(null),session.cfg.responseMs);
 }
 function answerRule(answer){if(state!=='switch')return;const ms=Math.min(session.cfg.responseMs,Math.max(0,Math.round(performance.now()-trialStarted)));if(task&&performance.now()>task.due)answer=null;responses.push({answer,ms});round++;task=null;setState('feedback');for(const b of $('gymTask').querySelectorAll('button'))b.disabled=true;status(answer===null?'本题超时，准备下一题。':'回答已记录。');schedule(switchTrial,230);}
 function pause(){
  if(state==='paused'){const snapshot=prior;prior=null;$('gymPauseOverlay').hidden=true;setState(snapshot.state);if(snapshot.task){task={callback:snapshot.task.callback,due:performance.now()+snapshot.remaining};if(state==='switch')trialStarted=performance.now()-(session.cfg.responseMs-snapshot.remaining);}status('继续这一阶段的练习。');tick();return;}
  if(!timed())return;prior={state,task,remaining:task?Math.max(0,task.due-performance.now()):0};task=null;setState('paused');$('gymPauseOverlay').hidden=false;status('已暂停，计时也已停止。');
 }
 function collect(){
  if(kind==='digits'){if(state==='answer'&&round<3&&$('gymDigitInput'))responses[round]=$('gymDigitInput').value;return Array.from({length:3},(_,i)=>responses[i]||'');}
  if(kind==='words')return [...selected];
  return Array.from({length:session.cfg.count},(_,i)=>responses[i]||{answer:null,ms:0});
 }
 async function submit(retry=false){
  if(!session||state==='grading')return;if(!retry){if(state==='paused'){const snapshot=prior;state=snapshot.state;}lastGrade={token:session.token,responses:collect()};}task=null;prior=null;clearInterval(interval);$('gymPauseOverlay').hidden=true;setState('grading');status('正在核对本轮答案…');
  try{const data=await api('grade',lastGrade);result=data;renderResult(data);setState('done');status('本轮已完成，可以在下方核对结果。');}catch(error){setState('error');status(error.message,true);}
 }
 function renderResult(data){
  $('gymScore').textContent=data.score;$('gymTimer').textContent='—';$('gymProgress').style.width='100%';$('gymTask').hidden=true;$('gymWelcome').hidden=false;$('gymWelcome').classList.remove('loading');$('gymWelcomeIcon').textContent='✳';$('gymWelcomeTitle').textContent='这一轮，完成了。';$('gymWelcomeText').textContent=`${data.name} · Lv. ${data.level} · ${data.score} 分，下方可查看逐项核对结果。`;$('gymResultTitle').textContent=data.name+' · 本轮结果';$('gymResultLevel').textContent='Lv. '+data.level;$('gymMetrics').replaceChildren();
  const labels=kind==='words'?['记住的词','误选干扰词','遗漏学习词']:kind==='digits'?['正确位数','错误位数','未填位数']:['正确题数','错误题数','未作答'];
  for(const [value,label]of [[data.score,'得分 / 100'],[data.correct,labels[0]],[data.incorrect,labels[1]],[data.unanswered,labels[2]]]){const div=node('div','result-metric'),b=node('b','',value),span=node('span','',label);div.append(b,span);$('gymMetrics').append(div);}
  $('gymFeedback').textContent=data.feedback;$('gymRows').replaceChildren();for(const row of data.rows){const tr=node('tr');for(const [i,text]of [row.label,row.prompt,row.expected,row.heard,row.detail].entries()){const td=node('td','',text);if(i===4)td.className=row.correct?'verdict-correct':'verdict-incorrect';tr.append(td);}$('gymRows').append(tr);}$('gymResults').hidden=false;$('gymSuggested').textContent=`练习 Lv. ${data.suggestedLevel} →`;
  if(!history.some(r=>r.id===data.id)){history.unshift({id:data.id,kind:data.kind,level:data.level,score:data.score,at:Date.now()});history=history.slice(0,200);try{localStorage.setItem('number-garden-gym-v1',JSON.stringify(history));}catch{}renderHistory();}
 }
 async function start(){
  if(busy())return;configure();const token=++epoch,abortController=new AbortController();controller=abortController;const timeout=setTimeout(()=>abortController.abort(),180000);setState('loading');$('gymWelcome').classList.add('loading');$('gymWelcomeIcon').textContent='✧';$('gymWelcomeTitle').textContent=`正在生成 Lv. ${level} 新题`;$('gymWelcomeText').textContent='模型正在按当前难度生成材料，请稍等。';status('正在连接模型出题，可以取消后重新选择。');
  try{const data=await api('challenge',{kind,level},abortController.signal);if(token!==epoch)return;session=data;responses=[];round=0;selected=new Set();interval=setInterval(tick,40);if(matchMedia('(max-width:670px)').matches)$('gymSurface').scrollIntoView({behavior:'smooth',block:'start'});if(kind==='digits')digitStudy();else if(kind==='words')wordStudy();else switchTrial();}catch(error){if(token!==epoch)return;setState('error');$('gymWelcome').classList.remove('loading');$('gymWelcomeIcon').textContent='↻';$('gymWelcomeTitle').textContent='本轮出题暂未完成';$('gymWelcomeText').textContent='可以重新出题，之前的练习成绩仍保留。';status(error.name==='AbortError'?'出题等待超时，请稍后重试。':error.message,true);}finally{clearTimeout(timeout);if(token===epoch)controller=null;}
 }
 for(let n=1;n<=10;n++){const b=button(String(n),()=>{if(busy())return;level=n;configure();},'gym-level');b.dataset.level=n;b.setAttribute('aria-label','难度 '+n+' 级');$('gymLevels').append(b);}
 $('gymStart').onclick=start;$('gymAgain').onclick=start;$('gymSuggested').onclick=()=>{if(busy()||!result)return;level=result.suggestedLevel;void start();};$('gymRetry').onclick=()=>void submit(true);$('gymPause').onclick=$('gymResume').onclick=pause;
 $('gymEnd').onclick=()=>{if(state==='loading'){epoch++;controller?.abort();controller=null;configure();status('已取消出题，可以重新选择。');return;}void submit();};
 document.addEventListener('training-navigate',event=>{if(meta[event.detail.key]&&!busy()&&event.detail.key!==kind){kind=event.detail.key;level=levels[kind];configure();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&timed())pause();});$('helpBtn').addEventListener('click',()=>{if(timed())pause();});
 document.addEventListener('keydown',event=>{if(state!=='switch'||$('help').open||event.repeat)return;const answer=['ArrowLeft','1'].includes(event.key)?0:['ArrowRight','2'].includes(event.key)?1:null;if(answer!==null){event.preventDefault();answerRule(answer);}});
 window.addEventListener('beforeunload',event=>{if(busy()){event.preventDefault();event.returnValue='';}});window.addEventListener('pagehide',()=>{clearInterval(interval);controller?.abort();});
 level=levels[kind];configure();const initial=location.hash.slice(1)||'numbers';nav.go(['numbers','stroop','programming',...Object.keys(meta)].includes(initial)?initial:'numbers');
})();
