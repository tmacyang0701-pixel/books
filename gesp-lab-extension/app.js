/* global monaco */
import {escapeHtml as esc, safeUrl, normalizeProblem, recommendProblems, slideHtml, exportHtml, problemSamplesHtml} from './ui/core.js';
import {isSourceTag, librarySources, filterLibrary, belongsToLibrary, libraryPage} from './ui/library-filters.js';
import {isCspProblem,isTheoryProblem,cspPeriods,cspDetails,theoryFeedback,classificationLabel,problemGroupLabel} from './ui/csp-library.js';
import {createChatPanel} from './ui/chat-panel.js';
import {createLessonRunner} from './ui/lesson-runner.js';
import {createLessonDebugger} from './ui/lesson-debugger.js';
import {createCodeAnalysis} from './ui/code-analysis.js';
import {createPracticePicker} from './ui/practice-picker.js';
import {unpackPracticeRecords,variantsForProblem} from './ui/practice-source.js';
import {createAnalysisSettings} from './ui/analysis-settings.js';
import {createVisualPlayer} from './ui/visual-player.js';
import {createExamplePlayer} from './ui/lesson-examples.js';
import {pagePseudocode} from './ui/pseudocode.js';
import {createCodeAccess} from './ui/code-access.js';
import {startLearningService} from './ui/service-control.js';
import {createServiceEndpoint} from './ui/service-endpoint.js';
import {knowledgeTag,knowledgeParts,knowledgeId,topicProblems,topicProblem,topicPage,knowledgeHtml,knowledgeDirectoryHtml} from './ui/knowledge.js';
import {lessonProse} from './ui/lesson-prose.js';
import {createSyntaxLab} from './ui/syntax-lab.js';
const $=id=>document.getElementById(id);
const asset=path=>globalThis.chrome?.runtime?.getURL?chrome.runtime.getURL(path):new URL(path,location.href).href;
const API=location.protocol==='chrome-extension:'?'http://127.0.0.1:8766':location.origin;
const serviceEndpoint=createServiceEndpoint({sendNative,defaultUrl:API,extensionPage:location.protocol==='chrome-extension:'});
const blankCode='#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里开始解题\n    return 0;\n}\n';
const starter='#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n';
function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function saveLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{toast('本地存储空间不足，请导出需要保留的内容');return false}}
let libraryGroup=readLocal('ca-library-group','gesp');if(!['gesp','csp-j','csp-s','bank','ungraded'].includes(libraryGroup))libraryGroup='gesp';
const state={level:Math.min(8,Math.max(1,Number(readLocal('ca-level',5))||5)),bank:[],levels:[],cache:new Map(),uploaded:readLocal('ca-uploaded',[]),practice:[],lessons:[],lesson:readLocal('ca-last-lesson',null),slide:0,activeProblem:null,preview:null,health:null,view:'learn'};
if(!Array.isArray(state.uploaded))state.uploaded=[];
let practiceSource=null;
try{const saved=readLocal('ca-practice-source',null);if(saved)practiceSource=normalizeProblem(saved);}catch{}
function practiceProblem(){return practiceSource||[state.lesson?.problem,state.activeProblem].find(p=>p&&p.kind!=='knowledge-topic');}
const practicePicker=createPracticePicker({getGroups:()=>[[practiceProblem()].filter(Boolean),state.bank,state.uploaded,state.practice,state.lessons.map(l=>l.problem).filter(Boolean)],onSelect:async(selected,isCurrent)=>{
  const p=selected.description?normalizeProblem(selected):await getProblem(selected.id);
  if(!isCurrent())return;
  practiceSource=p;saveLocal('ca-practice-source',p);renderPractice();toast('已切换为：'+p.title);
}});
state.uploaded=state.uploaded.filter(p=>{try{normalizeProblem(p);return typeof p.id==='string'}catch{return false}});
let editor,editorLoading=false,programmaticEdit=false,judgeBusy=false,previewToken=0,toastTimer,activeTask=null,retryAction=null,lastTaskRequest=null,generationProblem=null,uploadDraft=null,uploadBusy=false;
const lessonVisual=createVisualPlayer();
const lessonExamples=createExamplePlayer();
const codeAccess=createCodeAccess({toast});
const syntaxLab=createSyntaxLab({root:$('slideContent'),sendNative,toast});
const pageChat=createChatPanel({api,toast,getVisualContext:(id,index)=>{const pseudo=state.lesson?.id===id?pagePseudocode(state.lesson.pages[index],state.lesson):null;return [syntaxLab.context(id,index),lessonExamples.context(id,index),pseudo?'本页伪代码：\n'+pseudo.code.slice(0,1800)+'\n示例：'+pseudo.example.slice(0,500):'',lessonVisual.context(id,index)].filter(Boolean).join('\n').slice(0,6000)},onOpen:()=>{$('lessonRunPanel').hidden=true;$('toggleLessonRun').setAttribute('aria-expanded','false')}});
const lessonRunner=createLessonRunner({sendNative,api,toast,canRun:codeAccess.has,onOpen:()=>pageChat.toggle(false,{remember:false}),onChat:()=>pageChat.toggle(true)});
let workspaceDebugActive=false;
const workspaceDebugger=createLessonDebugger({root:$('workspaceDebug'),mount:$('view-workspace'),onState:({active,busy})=>{workspaceDebugActive=active||busy;updateWorkspaceActions();}});
const codeAnalysis=createCodeAnalysis({api,toast,getSnapshot:()=>({problem:state.activeProblem,code:editor?.getValue()||'',input:$('stdin').value}),onState:busy=>{$('analyzeBtn').disabled=busy;$('analyzeBtn').textContent=busy?'分析中…':'代码分析';}});
const analysisSettings=createAnalysisSettings({api,toast});
let knowledgeCatalog=null,knowledgeContext=readLocal('ca-knowledge',null),knowledgeReturn=false;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200)}
function empty(title,text,button=''){return `<div class="empty-state"><h3>${esc(title)}</h3><p class="small">${esc(text)}</p>${button}</div>`}
const tagsHtml=p=>isCspProblem(p)?`<div class="card-tags">${['来源：学而思',...(p.knowledgePoints||[])].map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:`<div class="card-tags">${(p.tags||[]).map(t=>isSourceTag(t)?`<span class="tag">${esc(t)}</span>`:knowledgeTag(t,p.level||state.level)).join('')}</div>`;
let libraryPageNumber=1,libraryFilterKey='';
const listTags=p=>isCspProblem(p)?[classificationLabel(p),...(p.knowledgePoints||[]),'来源：学而思']:(p.tags||[]);
const meta=p=>isCspProblem(p)?`${problemGroupLabel(p)} · ${isTheoryProblem(p)?'理论题':'编程题'} · ${classificationLabel(p)}`:p.kind==='knowledge-topic'?`知识点专题 · GESP ${p.level} 级`:p.kind==='generated'?`AI 原创${p.knowledgeTopic?'专项练习':'变式'} · ${p.difficulty||'练习'} · ${p.level} 级`:p.kind==='uploaded'?`我的题目 · ${p.level} 级`:`${p.session||'入门示例'} · C++ ${p.level||1} 级`;
const allProblems=()=>[...state.bank,...state.uploaded];
async function jsonAsset(path){const r=await fetch(asset(path));if(!r.ok)throw Error('题库文件加载失败');return r.json()}
async function api(path,body,method=body?'POST':'GET'){
  if(path==='/api/lesson-code'){
    const health=await api('/api/health');if(!health.capabilities?.includes('regenerateLessonCode'))throw Error('重新生成本页代码需要更新后台，请点击“启动／更新后台”后重试。');
  }
  if(path==='/api/practice'&&body?.problem){
    const health=await api('/api/health');if(!health.capabilities?.includes('practiceSourceSelection'))throw Error('切换题目后生成变式需要更新后台，请点击“启动／更新后台”后重试。');
  }
  if(path==='/api/knowledge-practice'||(path==='/api/lessons'&&body?.problem?.kind==='knowledge-topic')){
    const health=await api('/api/health');if(health.version<12||!health.capabilities?.includes('topicSyntaxLabs')||!health.capabilities?.includes('knowledgeTopics'))throw Error('知识点讲解与专项练习需要更新后台，请点击“启动／更新后台”后重试。');
  }
  if(path==='/api/code-analysis'||path.startsWith('/api/analysis-')){
    const health=await api('/api/health');
    if(health.version<12||!health.capabilities?.includes('codeAnalysis'))throw Error('代码分析需要更新后台，请点击“启动／更新后台”后重试。');
  }
  if(path==='/api/run-cases'){
    const health=await api('/api/health');
    if(!health.capabilities?.includes('runCases')||!(health.runCaseSchema>=2))throw Error('后台尚未加载换用例修复，请点击“启动／更新后台”后重试。');
  }
  if(path==='/api/chat'){
    const health=await api('/api/health');
    if(!health.capabilities?.includes('pageChat')){const error=Error('当前后台版本过旧，尚未加载问答接口。请点击“启动／更新后台”，完成后重试回答。');error.code='service_outdated';throw error;}
    if(body?.messages?.some(m=>m.attachments?.length)&&!health.capabilities?.includes('imagePageChat'))throw Error('图片问答需要更新后台，请点击“启动／更新后台”后重试。');
  }
  let response;
  try{response=await fetch((await serviceEndpoint(path==='/api/health'))+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)})}
  catch{throw Error('无法连接本地讲解服务，请点击页面上的“启动／更新后台”')}
  let value;try{value=await response.json()}catch{throw Error('本地服务返回格式异常')}
  if(!response.ok){const error=Error(value.error?.message||`请求失败（${response.status}）`);error.status=response.status;error.code=value.error?.code;throw error}
  return value;
}
async function checkService(){
  try{
    state.health=await api('/api/health');
    if(state.health.service!=='codearena-learning')throw Error('端口被其他程序占用');
    const outdated=state.health.version<12||!state.health.capabilities?.includes('codeAnalysis')||!state.health.capabilities?.includes('runCases')||!(state.health.runCaseSchema>=2),ready=state.health.configured&&!outdated;
    $('serviceStatus').textContent=outdated?'后台需要更新':ready?state.health.model+' · 本地服务已连接':'本地服务已连接 · 待配置密钥';
    $('serviceStatus').classList.toggle('ready',ready);
    $('serviceDetails').innerHTML='<h3>'+(outdated?'后台版本过旧':ready?'本地服务已连接':'需要配置千问密钥')+'</h3><p class="small muted">模型：'+esc(state.health.model)+'<br>配置来源：'+esc(state.health.configSource)+'</p><p class="small muted">'+(outdated?'点击下方“启动／更新后台”加载新版问答服务。':'模型调用是否成功，以生成任务的结果为准。')+'</p>';
    return true;
  }catch(e){state.health=null;$('serviceStatus').textContent='讲解服务未启动';$('serviceStatus').classList.remove('ready');$('serviceDetails').innerHTML='<h3>本地服务未连接</h3><p class="small muted">'+esc(e.message)+'</p>';return false}
}
let serviceStarting=null;
function startServiceFromPage(){
  if(serviceStarting)return serviceStarting;
  serviceStarting=(async()=>{
    for(const id of ['startServiceBtn','startServiceDialogBtn'])$(id).disabled=true;
    try{
      await startLearningService({sendNative,getHealth:()=>api('/api/health'),onProgress:text=>{$('startServiceBtn').textContent=text;$('startServiceDialogBtn').textContent=text;$('serviceStatus').textContent=text;}});
      await checkService();await refreshHistory();await refreshPractice();toast('新版后台已启动，可以点击“重试回答”继续问答');
    }catch(error){
      await checkService();$('serviceDetails').innerHTML='<h3>后台启动未完成</h3><p class="small muted">'+esc(error.message)+'</p>';
      if(!$('serviceDialog').open)$('serviceDialog').showModal();toast(error.message);
    }finally{for(const id of ['startServiceBtn','startServiceDialogBtn']){$(id).disabled=false;$(id).textContent='启动／更新后台';}serviceStarting=null;}
  })();
  return serviceStarting;
}
function setView(name){
  if(!['learn','library','courses','lesson','practice','workspace','knowledge'].includes(name))name='learn';
  if(state.view==='workspace'&&name!=='workspace'){workspaceDebugger.close();codeAnalysis.close();analysisSettings.close();}
  const previous=state.view;state.view=name;for(const el of document.querySelectorAll('.view'))el.hidden=el.id!==`view-${name}`;
  for(const el of document.querySelectorAll('[data-view]')){el.classList.toggle('active',el.dataset.view===(name==='lesson'?'courses':name));el.setAttribute('aria-current',el.dataset.view===(name==='lesson'?'courses':name)?'page':'false')}
  if(location.hash!==`#${name}`)history.replaceState(null,'',`#${name}`);
  if(name==='workspace'){initEditor();updateWorkspaceActions();requestAnimationFrame(()=>editor?.layout?.())}
  if(name==='lesson'||name==='courses')refreshHistory();
  if(name!==previous)for(const panel of $('view-'+name).querySelectorAll('.page-scroll,.slide-scroll'))panel.scrollTop=0;
  if(name==='practice')renderPractice();
  if(name==='knowledge')renderKnowledge();
  if(name!=='lesson'){stopSpeech();lessonVisual.pause();lessonExamples.pause();pageChat.cancelInput();}
}
function lessonForProblem(p){return state.lessons.find(l=>l.problemId===p.id)||(state.lesson?.problem?.id===p.id?state.lesson:null)}
function lessonButton(p,label='生成讲解'){const lesson=lessonForProblem(p);return lesson?`<button class="primary" data-action="open-lesson" data-id="${esc(lesson.id)}">查看课件 →</button>`:`<button class="primary" data-action="study" data-id="${esc(p.id)}">${label}</button>`}
function previewActions(p){if(isTheoryProblem(p))return '<span class="small muted">选择选项后点击“核对答案”。</span>';return lessonButton(p,'生成讲解课件')+(lessonForProblem(p)?`<button class="ghost" data-action="study" data-id="${esc(p.id)}">重新生成</button>`:'')+`<button class="ghost" data-action="code" data-id="${esc(p.id)}">编程练习 →</button>`}
function relatedLessons(p){const lessons=state.lessons.filter(l=>l.problemId===p.id);return lessons.length?`<section class="related-lessons"><h3>本题已生成的课件 <span>${lessons.length} 份</span></h3>${lessons.map(l=>`<button class="lesson-link" data-action="open-lesson" data-id="${esc(l.id)}"><strong>${esc(l.title)} ↗</strong><small>${new Date(l.createdAt*1000).toLocaleString('zh-CN')} · ${esc(l.model)}</small></button>`).join('')}</section>`:''}
function refreshLessonLinks(){if(state.view==='knowledge')renderKnowledge();const actions=$('problemPreview').querySelector('.preview-actions'),list=$('problemPreview').querySelector('.problem-lessons');if(actions&&state.preview)actions.innerHTML=previewActions(state.preview);if(list&&state.preview)list.innerHTML=relatedLessons(state.preview);$('workspaceLesson').textContent=state.activeProblem&&lessonForProblem(state.activeProblem)?'查看本题课件':'生成本题讲解';renderLearn();renderPractice()}
function card(p,reason=''){return `<article class="problem-card"><div class="card-meta">${esc(meta(p))}</div><h3>${esc(p.title)}</h3>${tagsHtml(p)}${reason?`<p class="small muted">${esc(reason)}</p>`:''}<div class="button-row">${lessonButton(p)}<button class="ghost" data-action="code" data-id="${esc(p.id)}">独立练习 →</button></div></article>`}
function learnProblemRow(p){return `<article class="learn-problem-row"><div class="learn-problem-info"><h3>${esc(p.title)}</h3><div class="learn-problem-meta"><span class="card-meta">${esc(meta(p))}</span>${tagsHtml(p)}</div></div><div class="button-row">${lessonButton(p,'讲解')}<button class="ghost" data-action="code" data-id="${esc(p.id)}">编程练习 →</button></div></article>`}
function renderLearn(){
  const info=state.levels[state.level-1];if(!info)return;
  $('learnLevel').value=state.level;
  $('navLevel').textContent=`GESP ${state.level} 级`;
  $('levelTitle').textContent=info.title;$('levelSummary').textContent=info.summary;
  $('levelTopics').innerHTML=info.topics.map(t=>knowledgeTag(t,state.level)).join('');$('levelGoals').innerHTML=info.goals.map(g=>`<li>${esc(g)}</li>`).join('');
  const featured=allProblems().filter(p=>p.level===state.level&&!isTheoryProblem(p)).slice(-6).reverse();
  $('featuredProblems').innerHTML=featured.length?featured.map(learnProblemRow).join(''):empty('本级真题正在整理','可以先上传自己的题目，按当前等级生成讲解。','<button data-action="upload" class="primary">上传一道题</button>');
  $('bankCount').textContent=state.bank.length;$('completedCount').textContent=Object.keys(readLocal('ca-completed',{})).length;
  $('libraryLevel').value=libraryGroup==='gesp'?state.level:libraryGroup;
}
function changeLevel(level){libraryGroup='gesp';saveLocal('ca-library-group',libraryGroup);state.level=Number(level);saveLocal('ca-level',state.level);for(const id of ['sessionFilter','tagFilter','sourceFilter','weekFilter','contestGroupFilter','questionTypeFilter','bankOriginFilter','bankDifficultyFilter'])$(id).value='';renderLearn();renderLibrary()}
function openKnowledge(topic,level,group=''){
  if(!knowledgeCatalog||typeof topic!=='string'||!topic.trim()||topic.length>100||!Number.isInteger(level)||level<1||level>8)return;
  if(state.level!==level){state.level=level;saveLocal('ca-level',level);renderLearn();}
  const parts=knowledgeParts(topic,knowledgeCatalog);knowledgeContext={topic:parts[0],group:parts.length>1?topic:group,level};
  saveLocal('ca-knowledge',knowledgeContext);if($('generateDialog').open)$('generateDialog').close();setView('knowledge');$('knowledgeContent').scrollTop=0;
}
function renderKnowledge(){
  if(!knowledgeCatalog)return;
  if(!knowledgeContext||typeof knowledgeContext.topic!=='string'||!Number.isInteger(knowledgeContext.level)||knowledgeContext.level<1||knowledgeContext.level>8){$('knowledgeContent').innerHTML=knowledgeDirectoryHtml(state.levels,state.level,knowledgeCatalog);return;}
  const lessons=[...state.lessons];if(state.lesson&&!lessons.some(l=>l.id===state.lesson.id))lessons.push({...state.lesson,problemId:state.lesson.problem?.id});
  $('knowledgeContent').innerHTML=knowledgeDirectoryHtml(state.levels,knowledgeContext.level,knowledgeCatalog,true)+knowledgeHtml({...knowledgeContext,catalog:knowledgeCatalog,bank:state.bank,lessons,generated:state.practice,card});
}
function returnToKnowledge(){
  if(state.lesson?.problem?.kind==='knowledge-topic'){const topic=state.lesson.problem.tags[0];openKnowledge(topic,state.lesson.targetLevel,knowledgeContext?.topic===topic?knowledgeContext.group:'');return;}
  if(knowledgeContext)setView('knowledge');else setView('learn');
}
function renderLibrary(){
  const csp=libraryGroup!=='gesp',problems=allProblems(),groupProblems=problems.filter(p=>belongsToLibrary(p,{group:libraryGroup,level:state.level}));
  const refill=(id,values,label)=>{const selected=$(id).value;$(id).innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${esc(v)}">${id==='weekFilter'?'第 '+esc(v)+' 周':esc(v)}</option>`).join('');$(id).value=values.includes(selected)?selected:'';};
  refill('sessionFilter',[...new Set(groupProblems.flatMap(p=>p.occurrences?.length?cspPeriods(p):[p.session]).filter(Boolean))].sort().reverse(),'全部场次');
  refill('tagFilter',[...new Set(groupProblems.flatMap(p=>isCspProblem(p)?p.knowledgePoints||[]:(p.tags||[]).filter(t=>!isSourceTag(t))))].sort(),'全部知识点');
  refill('weekFilter',[...new Set(groupProblems.flatMap(p=>(p.occurrences||[]).map(r=>String(r.week))))].sort((a,b)=>Number(a)-Number(b)),'全部周次');
  refill('contestGroupFilter',[...new Set(groupProblems.flatMap(p=>(p.occurrences||[]).map(r=>r.group)))].sort(),'全部赛事组别');
  for(const id of ['weekFilter','contestGroupFilter'])$(id).closest('label').hidden=!groupProblems.some(p=>p.occurrences?.length);
  $('questionTypeFilter').closest('label').hidden=!groupProblems.some(isTheoryProblem);
  refill('bankOriginFilter',[...new Set(groupProblems.map(p=>p.bankOrigin).filter(Boolean))].sort(),'全部原题源');
  refill('bankDifficultyFilter',[...new Set(groupProblems.map(p=>p.platformDifficulty).filter(Boolean))].sort(),'全部原难度');
  for(const id of ['bankOriginFilter','bankDifficultyFilter'])$(id).closest('label').hidden=!groupProblems.some(p=>p.collection==='xiaohou-bank');
  const sources=librarySources(groupProblems),selectedSource=$('sourceFilter').value;
  $('sourceFilter').innerHTML='<option value="">全部来源</option>'+sources.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  $('sourceFilter').value=sources.includes(selectedSource)?selectedSource:'';
  const list=filterLibrary(problems,{level:state.level,group:libraryGroup,source:$('sourceFilter').value,session:$('sessionFilter').value,tag:$('tagFilter').value,query:$('searchInput').value,week:$('weekFilter').value,contestGroup:$('contestGroupFilter').value,questionType:$('questionTypeFilter').value,origin:$('bankOriginFilter').value,difficulty:$('bankDifficultyFilter').value});
  const filterKey=JSON.stringify([libraryGroup,state.level,...['sourceFilter','sessionFilter','tagFilter','searchInput','weekFilter','contestGroupFilter','questionTypeFilter','bankOriginFilter','bankDifficultyFilter'].map(id=>$(id).value)]);
  if(filterKey!==libraryFilterKey){libraryPageNumber=1;libraryFilterKey=filterKey;}
  const page=libraryPage(list,libraryPageNumber);libraryPageNumber=page.page;
  const groupName=libraryGroup==='bank'?'学而思题库':libraryGroup==='ungraded'?'待归级／竞赛拓展':csp?libraryGroup.toUpperCase():`GESP ${state.level} 级`;
  $('libraryCount').textContent=`${groupName} · ${list.length} 道题目${list.some(isCspProblem)?' · 等级与训练分组详见题面说明':''}`;
  $('libraryPager').hidden=page.pages<=1;
  $('libraryPager').innerHTML=`<button data-action="library-page" data-page="${page.page-1}" ${page.page===1?'disabled':''}>上一页</button><span>第 ${page.page} / ${page.pages} 页 · 每页 200 题</span><button data-action="library-page" data-page="${page.page+1}" ${page.page===page.pages?'disabled':''}>下一页</button>`;
  $('problemList').innerHTML=page.items.length?page.items.map((p,i)=>`<button class="question-row ${state.preview?.id===p.id?'selected':''}" data-action="preview" data-id="${esc(p.id)}" title="${esc(p.title)} · ${esc(meta(p))}"><span class="q-number">${String((page.page-1)*200+i+1).padStart(2,'0')}</span><span class="q-info"><span class="q-heading"><strong>${esc(p.title)}</strong><span class="card-meta">${esc(p.session||'我的题目')}</span></span><span class="q-tags" title="${esc((p.tags||[]).join(' · '))}">${esc(listTags(p).join(' · '))}</span></span></button>`).join(''):empty('暂无匹配题目',csp&&!groupProblems.length?'此分组已建立，当前尚未取得对应赛事组别的题目。':'换个筛选条件，或上传自己的题目。','<button data-action="upload">上传题目</button>');
  if(!list.length){previewToken++;state.preview=null;$('problemPreview').innerHTML=empty('从一道题开始','没有匹配当前筛选条件的题目，请调整条件，也可上传题目。');return}
  if(!page.items.some(p=>p.id===state.preview?.id))previewProblem(page.items[0].id);
}
async function getProblem(id){
  if(state.cache.has(id))return state.cache.get(id);
  const local=[...state.uploaded,...state.practice].find(p=>p.id===id);if(local)return normalizeProblem(local);
  const item=state.bank.find(p=>p.id===id);if(!item)throw Error('题目不存在或尚未加载');
  const problem=normalizeProblem(await jsonAsset(item.file));state.cache.set(id,problem);return problem;
}
function problemHtml(p,{compact=false}={}){
  const source=p.source||{};
  const heading=compact?`<div class="problem-title-row"><h2>${esc(p.title)}</h2><span class="card-meta">${esc(meta(p))}</span></div>`:`<div class="card-meta">${esc(meta(p))}</div><h2>${esc(p.title)}</h2>`;
  const extraTests=typeof p.extraTests==='string'&&/^data\/gesp\/extra-tests\/[a-z0-9-]+\.zip$/.test(p.extraTests)?`<a href="${esc(p.extraTests)}" download>下载完整测试包（含大数据）</a>`:'';
  const sources=`${esc(p.casesSource||'上传或自编练习数据')}<br>${esc(source.note||'')}<div class="source-links">${[['原卷 PDF',source.pdfUrl],['题目来源',source.referenceUrl],[source.organization==='CCF GESP'?'CCF 真题目录':'课程来源',source.url]].map(([t,url])=>safeUrl(url)?`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${t} ↗</a>`:'').join('')}${extraTests}</div>`;
  if(isCspProblem(p))return `${heading}${tagsHtml(p)}${cspDetails(p)}${isTheoryProblem(p)?'':problemSamplesHtml(p,{compact})}<div class="source-note">${sources}</div>`;
  return `${heading}${tagsHtml(p)}<div class="problem-section problem-prose">${esc(p.description)}</div>${[['输入格式',p.input],['输出格式',p.output],['数据范围',p.constraints]].map(([title,text])=>text?`<section class="problem-section"><h3>${title}</h3><p class="problem-prose">${esc(text)}</p></section>`:'').join('')}${problemSamplesHtml(p,{compact})}${p.hints?.length?`<details class="problem-section"><summary>需要一点提示？</summary><ul class="hint-list">${p.hints.map(h=>`<li>${esc(h)}</li>`).join('')}</ul></details>`:''}${compact?`<details class="source-note"><summary>题目来源与说明</summary>${sources}</details>`:`<div class="source-note">${sources}</div>`}`;
}
async function previewProblem(id){
  const token=++previewToken;$('problemPreview').innerHTML='<p class="loading-text">正在读取题目…</p>';
  try{const p=await getProblem(id);if(token!==previewToken)return;state.preview=p;$('problemPreview').innerHTML=`<div class="preview-body" tabindex="0" aria-label="题目正文">${problemHtml(p,{compact:true})}<div class="problem-lessons">${relatedLessons(p)}</div></div><div class="preview-actions">${previewActions(p)}</div>`;document.querySelectorAll('.question-row').forEach(el=>el.classList.toggle('selected',el.dataset.id===id))}
  catch(e){if(token===previewToken)$('problemPreview').textContent=e.message}
}
function codeKey(p=state.activeProblem){return 'ca-source-'+(p?.id||'demo')}
function saveCode(){if(editor&&!programmaticEdit&&state.activeProblem){try{localStorage.setItem(codeKey(),editor.getValue())}catch{}}}
function defaultCode(p){return p?.id==='demo'?localStorage.getItem('codearena-source')||starter:blankCode}
function trackBaseline(){if(editor&&state.activeProblem)codeAnalysis.baseline(state.activeProblem,editor.getValue());}
function initEditor(){
  if(editor||editorLoading)return;editorLoading=true;
  const initial=localStorage.getItem(codeKey())??defaultCode(state.activeProblem);
  const fallback=()=>{if(editor)return;const area=document.createElement('textarea');area.className='fallback-editor';area.spellcheck=false;area.value=initial;area.setAttribute('aria-label','C++ 源代码');$('editor').replaceChildren(area);editor={getValue:()=>area.value,setValue:v=>area.value=v,layout:()=>{}};area.addEventListener('input',saveCode);$('editorStatus').textContent='文本编辑器 · 自动保存';editorLoading=false;trackBaseline()};
  if(!window.require?.config){fallback();return}
  self.MonacoEnvironment={getWorkerUrl:()=>asset('vendor/vs/base/worker/workerMain.js')};
  window.require.config({paths:{vs:asset('vendor/vs')}});
  window.require(['vs/editor/editor.main'],()=>{if(editor)return;editor=monaco.editor.create($('editor'),{value:localStorage.getItem(codeKey())??defaultCode(state.activeProblem),language:'cpp',theme:'vs',fontSize:14,minimap:{enabled:false},automaticLayout:true,scrollBeyondLastLine:false,tabSize:4,padding:{top:15},ariaLabel:'C++ 源代码'});editor.onDidChangeModelContent(saveCode);$('editorStatus').textContent='Monaco · 自动保存';editorLoading=false;trackBaseline()},fallback);
}
function loadWorkspace(p){
  if(isTheoryProblem(p)){toast('理论题请在题库中选择选项作答');return;}
  if(judgeBusy){toast('请等待当前评测结束后再切换题目');return}
  workspaceDebugger.close();codeAnalysis.close();analysisSettings.close();
  saveCode();state.activeProblem=normalizeProblem(p);$('workspaceTitle').textContent=p.title;$('workspaceProblem').innerHTML=problemHtml(p);$('stdin').value=p.sampleInput||'';
  $('judgeBtn').disabled=!p.cases?.length;$('judgeBtn').title=p.cases?.length?'':'本题没有测试点，可用标准输入运行';$('result').textContent='运行代码后，结果将在这里显示。';$('resultState').textContent='';
  if(editor){programmaticEdit=true;editor.setValue(localStorage.getItem(codeKey())??defaultCode(p));programmaticEdit=false;trackBaseline()}
  $('workspaceLesson').textContent=lessonForProblem(p)?'查看本题课件':'生成本题讲解';toggleOutput(false);setView('workspace');
}
function toggleOutput(open){$('outputDrawer').hidden=!open;$('toggleOutput').setAttribute('aria-expanded',String(open));$('toggleOutput').textContent=open?'收起结果':'结果侧栏';requestAnimationFrame(()=>editor?.layout?.())}
function updateWorkspaceActions(){
  const busy=judgeBusy||workspaceDebugActive||!state.activeProblem;
  $('runBtn').disabled=busy;$('debugBtn').disabled=busy;$('judgeBtn').disabled=busy||!state.activeProblem?.cases?.length;
  $('debugBtn').querySelector('span').textContent=workspaceDebugActive?'调试中':'调试';
}
async function debugWorkspace(){
  if(judgeBusy||workspaceDebugActive||!state.activeProblem)return;
  if(!editor){toast('编辑器正在加载，请稍后再试');return}
  const code=editor.getValue(),input=$('stdin').value;
  if(!code.trim()){toast('请先输入 C++ 代码');return}
  if(new TextEncoder().encode(JSON.stringify({code,input})).length>210000){toast('代码和输入总量过大，请缩小输入');return}
  saveCode();
  try{await workspaceDebugger.start(code,input,'编程练习 · '+state.activeProblem.title+' · 当前代码与标准输入')}
  catch(error){workspaceDebugger.close();toast(error.message)}
}
function sendNative(payload){return new Promise((resolve,reject)=>{if(!globalThis.chrome?.runtime?.sendNativeMessage){reject(Error('本地评测需要在 Chrome 扩展中打开；当前为网页预览'));return}chrome.runtime.sendNativeMessage('com.codearena.cpp_judge',payload,response=>{const err=chrome.runtime.lastError;if(err){reject(Error(err.message));return}if(!response){reject(Error('本地程序无响应'));return}resolve(response)})})}
async function submit(mode){
  if(judgeBusy||workspaceDebugActive||!editor||!state.activeProblem)return;const p=state.activeProblem;
  if(mode==='judge'&&!p.cases.length){toast('本题没有测试点，请先使用运行功能');return}
  judgeBusy=true;updateWorkspaceActions();toggleOutput(true);$('resultTitle').textContent=mode==='run'?'运行结果':'评测结果';$('resultState').textContent='处理中';$('result').textContent='正在调用本地 C++ 编译器…';
  try{
    const payload={mode,code:editor.getValue(),input:$('stdin').value};if(mode==='judge')payload.cases=p.cases;
    if(new TextEncoder().encode(JSON.stringify(payload)).length>210000)throw Error('代码和测试数据总量过大，请缩小输入');
    const data=await sendNative(payload);if(data.error&&!data.status)throw Error(data.error);
    await codeAnalysis.attempt(p,payload.code,payload.input,mode,data);
    $('resultState').textContent=data.status;
    if(data.status==='CE'){$('result').textContent='编译失败 (CE)\n\n'+(data.compile||data.message);return}
    if(mode==='run'){$('result').innerHTML=`<span class="status-pill">${esc(data.status)} · ${esc(data.timeMs)} ms</span><p class="case-note">标准输出</p><pre>${esc(data.output||'(无输出)')}</pre>${data.error?`<p class="case-note">标准错误</p><pre>${esc(data.error)}</pre>`:''}`;return}
    const passed=data.results.filter(c=>c.status==='AC').length;
    $('result').innerHTML=`<div class="score-summary ${passed<data.results.length?'needs-work':''}"><div><strong>${esc(data.score)} <span class="small">/ ${esc(data.maxScore)}</span></strong><small>练习点得分</small></div><span class="small">${passed}/${data.results.length} 通过</span></div>`+data.results.map((c,i)=>`<details class="case-detail" ${c.status!=='AC'&&i===data.results.findIndex(v=>v.status!=='AC')?'open':''}><summary><b>测试点 ${esc(c.id)}</b><span class="${c.status==='AC'?'pass':'fail'}">${esc(c.status)}</span><span class="case-time">${esc(c.timeMs)} ms</span><span>${esc(c.score)}/${esc(c.maxScore)}</span></summary><div class="case-body"><label>输入</label><pre>${esc(p.cases[i]?.input||'')}</pre><label>预期输出</label><pre>${esc(c.expected??p.cases[i]?.expected??'')}</pre><label>实际输出${(c.actual||'').length>=1000?'（可能截断）':''}</label><pre>${esc(c.actual||'(无输出)')}</pre></div></details>`).join('')+`<p class="case-note">${esc(p.casesSource||'本地练习测试点')}。通过这些测试点不代表官方满分。</p>`;
  }catch(e){$('resultState').textContent='未完成';$('result').textContent='连接或执行失败：'+e.message+'\n\n请检查本地评测安装及扩展 ID 配置。'}finally{judgeBusy=false;updateWorkspaceActions()}
}
async function showGenerate(p){generationProblem=p;$('generationRequirements').value='';$('generateProblem').innerHTML=`<span class="small muted">${esc(meta(p))}</span><h3>${esc(p.title)}</h3>${tagsHtml(p)}${lessonForProblem(p)?'<p class="small muted">已有课件。生成成功后替换旧课件，并开始新的逐页问答；生成失败会保留旧课件。</p>':''}`;$('targetLevel').value=p.kind==='knowledge-topic'?p.level:state.level;$('targetLevel').disabled=p.kind==='knowledge-topic';$('generateDialog').showModal()}
function taskStatus(title,message,status='running'){const panel=$('taskPanel');panel.hidden=false;panel.className='task-panel'+(status==='failed'?' failed':status==='completed'?' done':'');$('taskTitle').textContent=title;$('taskMessage').textContent=message;$('taskRetry').hidden=status!=='failed';$('taskDismiss').hidden=status==='running'}
async function runTask(path,body,kind){
  if(activeTask){toast('已有任务正在进行，请等待完成');return}
  retryAction=()=>runTask(path,body,kind);activeTask={kind};taskStatus(kind==='lesson-code'?'正在重新生成代码':kind==='lesson'?'正在生成讲解':['practice','topic-practice'].includes(kind)?'正在生成练习':'正在读取题目','正在创建任务…');
  try{const job=await api(path,body);activeTask={id:job.id,kind};lastTaskRequest={id:job.id,path,body,kind};saveLocal('ca-active-task',activeTask);saveLocal('ca-task-request',kind==='import'?null:lastTaskRequest);await watchTask(activeTask)}
  catch(e){taskStatus('任务未完成',e.message,'failed');activeTask=null}
}
async function watchTask(task){
  let job;
  try{
    while(true){job=await api('/api/jobs/'+task.id);taskStatus(task.kind==='lesson-code'?'正在重新生成代码':task.kind==='lesson'?'正在生成讲解':['practice','topic-practice'].includes(task.kind)?'正在生成练习':'正在识别题目',job.message);if(task.kind==='import')$('uploadStatus').textContent=job.message;if(['completed','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,1200))}
  }catch(e){activeTask=null;retryAction=async()=>{activeTask=task;await watchTask(task)};taskStatus('连接已中断，任务可能仍在执行',e.message,'failed');return}
  localStorage.removeItem('ca-active-task');activeTask=null;
  if(job.status==='failed'){const saved=lastTaskRequest?.id===task.id?lastTaskRequest:readLocal('ca-task-request',null);retryAction=saved?.id===task.id?()=>runTask(saved.path,saved.body,saved.kind):task.kind==='import'?openUpload:()=>setView('library');taskStatus('任务未完成',job.error?.message||job.message,'failed');if(task.kind==='import')setUploadBusy(false);return}
  try{
    if(task.kind==='lesson-code'){
      const id=job.result.lessonId;
      if(state.lesson?.id===id){const updated=await api('/api/lessons/'+id);if(state.lesson?.id===id){lessonRunner.forgetLesson(id);state.lesson=updated;saveLocal('ca-last-lesson',updated);renderLesson();}}
      taskStatus('本页代码已重新生成',job.result.validation?.message||'英文标识符已检查，可点击运行代码验证。','completed');
    }
    if(task.kind==='lesson'){await openLesson(job.result.lessonId);await refreshHistory();setView('lesson');taskStatus('讲解课件已生成','可以开始逐页学习，完成后进入相似题练习。','completed')}
    if(task.kind==='topic-practice'){state.practice.push(...job.result.problems);openKnowledge(job.result.topic,job.result.targetLevel);taskStatus('专项练习已生成','3 道练习只围绕当前知识点，AI 测试点尚未独立验证。','completed')}
    if(task.kind==='practice'){state.practice.push(...unpackPracticeRecords([job.result]));renderPractice();setView('practice');taskStatus('3 道变式已生成','已保存到对应原题；AI 生成的测试点尚未独立验证。','completed')}
    if(task.kind==='import'){fillUpload(job.result.problem);setUploadBusy(false);$('uploadStatus').textContent='识别完成，请核对题干、输入输出与数据范围。';if(!$('uploadDialog').open)$('uploadDialog').showModal();taskStatus('题目已读取','核对后可以保存或生成讲解。','completed')}
    lastTaskRequest=null;localStorage.removeItem('ca-task-request');retryAction=null;
  }catch(e){retryAction=()=>task.kind==='lesson-code'?watchTask(task):task.kind==='lesson'?openLesson(job.result.lessonId):refreshPractice();taskStatus('内容已生成，加载未完成',e.message,'failed')}
}
async function openLesson(id){
  knowledgeReturn=false;
  const lesson=await api('/api/lessons/'+id);state.lesson=lesson;saveLocal('ca-last-lesson',lesson);state.slide=Math.min(lesson.pages.length-1,Math.max(0,Number(readLocal('ca-slide-'+id,0))||0));renderLesson();return lesson;
}
async function refreshHistory(){
  try{
    const lessons=await api('/api/lessons'),links=readLocal('ca-lesson-links',{});
    const missing=lessons.filter(l=>!(l.problemId||links[l.id]));
    // Older running services return summaries without problem IDs; resolve each once.
    for(let i=0;i<missing.length;i+=4)await Promise.all(missing.slice(i,i+4).map(async l=>{try{const full=await api('/api/lessons/'+l.id);links[l.id]=full.problem?.id}catch{}}));
    const remaining=new Set(lessons.map(l=>l.id));
    for(const id of Object.keys(links).filter(id=>!remaining.has(id)))await forgetLesson(id);
    if(state.lesson&&!remaining.has(state.lesson.id))await forgetLesson(state.lesson.id);
    state.lessons=lessons.map(l=>({...l,problemId:l.problemId||links[l.id]}));
    saveLocal('ca-lesson-links',Object.fromEntries(state.lessons.filter(l=>l.problemId).map(l=>[l.id,l.problemId])));
    const currentId=state.lesson?.id;
    if(currentId){const latest=await api('/api/lessons/'+currentId);if(state.lesson?.id===currentId){state.lesson=latest;state.slide=Math.min(state.slide,latest.pages.length-1);saveLocal('ca-last-lesson',latest);}}
    renderHistory(lessons);if(!state.lesson&&lessons.length)await openLesson(lessons[0].id);refreshLessonLinks();
  }
  catch{renderHistory(state.lesson?[state.lesson]:[])}
}
let historyItems=[];
function renderHistory(lessons=historyItems,refreshReader=true){
  historyItems=lessons;
  const level=$('coursewareLevel').value,query=$('coursewareSearch').value.trim().normalize('NFKC').toLowerCase();
  const matches=lessons.filter(l=>(!level||Number(l.targetLevel)===Number(level))&&(!query||String(l.title||'').normalize('NFKC').toLowerCase().includes(query)));
  $('coursewareCount').textContent=level||query?`找到 ${matches.length} 份 · 共 ${lessons.length} 份课件`:`共 ${lessons.length} 份课件`;
  const done=readLocal('ca-completed',{});$('lessonHistory').innerHTML=matches.length?matches.map(l=>`<article class="history-card ${l.id===state.lesson?.id?'selected':''}"><button class="history-open" data-action="open-lesson" data-id="${esc(l.id)}"><span class="card-meta">GESP ${esc(l.targetLevel)} 级 · ${done[l.id]?'已学完':'继续学习'}</span><strong>${esc(l.title)}</strong><span class="tiny-label">${new Date(l.createdAt*1000).toLocaleDateString('zh-CN')}</span></button><button class="lesson-delete" data-action="delete-lesson" data-id="${esc(l.id)}" aria-label="删除课件：${esc(l.title)}">删除</button></article>`).join(''):empty(lessons.length?'没有符合条件的课件':'还没有讲解课件',lessons.length?'请调整等级、标题关键词，或点击清除筛选。':'从真题库选择一道题，或上传自己的题目。');if(refreshReader){if(state.lesson)renderLesson();else {$('lessonPlayer').hidden=true;if(state.view==='lesson')setView('courses');}}}
async function forgetLesson(id){syntaxLab.forgetLesson(id);codeAccess.forgetLesson(id);try{await pageChat.forgetLesson(id)}catch(e){toast(e.message)}lessonRunner.forgetLesson(id);localStorage.removeItem('ca-slide-'+id);const done=readLocal('ca-completed',{});delete done[id];saveLocal('ca-completed',done);if(state.lesson?.id===id){stopSpeech();lessonVisual.pause();lessonExamples.pause();state.lesson=null;saveLocal('ca-last-lesson',null);$('lessonPlayer').hidden=true;}}
async function deleteLesson(id){if(!confirm('删除这份课件及本机问答记录？原题会保留，可以重新生成。'))return;await api('/api/lessons/'+id,undefined,'DELETE');await forgetLesson(id);state.lessons=state.lessons.filter(l=>l.id!==id);await refreshHistory();refreshLessonLinks();toast('课件已删除，原题已保留');}
function renderLesson(){
  const lesson=state.lesson;if(!lesson?.pages?.length)return;$('lessonPlayer').hidden=false;$('lessonTitle').textContent=lesson.title;$('lessonModel').textContent=`GESP ${lesson.targetLevel} 级 · ${lesson.model} · AI 生成讲解`;
  const isTopic=lesson.problem?.kind==='knowledge-topic';$('backToKnowledge').hidden=!(isTopic||knowledgeReturn);$('topicLegacyNote').hidden=!(isTopic&&lesson.topicSchema!==2);
  $('returnToProblem').hidden=isTopic||!lesson.problem?.title||!(lesson.problem.description||lesson.problem.statement);
  const page=lesson.pages[state.slide];$('slideKind').textContent=page.kind||'';$('slideContent').innerHTML=slideHtml(page,{interactive:true,lesson,codeUnlocked:codeAccess.has(lesson.id,state.slide)});$('narrationText').innerHTML=lessonProse(page.narration||'');$('slideCounter').textContent=`${state.slide+1} / ${lesson.pages.length}`;$('prevSlide').disabled=state.slide===0;$('nextSlide').textContent=state.slide===lesson.pages.length-1?'完成讲解，开始练习 →':'下一页 →';
  lessonVisual.setPage(lesson,state.slide);
  lessonExamples.setPage(lesson,state.slide);
  syntaxLab.setPage(lesson,state.slide);
  pageChat.showPage(lesson,state.slide);
  $('slideOutline').innerHTML=lesson.pages.map((p,i)=>`<button class="${i===state.slide?'active':''}" data-slide="${i}" aria-current="${i===state.slide?'step':'false'}"><span>${String(i+1).padStart(2,'0')}</span>${esc(p.title)}</button>`).join('');
  $('lessonFinish').hidden=state.slide!==lesson.pages.length-1;$('lessonFinish').innerHTML=`<h2>把刚学会的方法，用在下一道题。</h2><p>先尝试独立分析，再查看提示或生成讲解。</p><div class="button-row"><button class="primary" data-action="finish">完成学习 · 进入相似题</button><button class="ghost" data-action="lesson-code">回到原题编程</button></div>`;if(isTopic)$('lessonFinish').innerHTML='<h2>用这个知识点，独立做一道练习。</h2><p>优先练习题库里的单知识点题目，没有匹配题时再生成原创练习。</p><button class="primary" data-action="finish">完成讲解 · 进入专项练习</button>';saveLocal('ca-slide-'+lesson.id,state.slide);
}
function moveSlide(n){stopSpeech();if(!state.lesson)return;state.slide=Math.max(0,Math.min(state.lesson.pages.length-1,n));renderLesson();document.querySelector('.slide-scroll').scrollTop=0;$('narrationText').scrollTop=0;}
function finishLesson(){if(!state.lesson)return;const done=readLocal('ca-completed',{});done[state.lesson.id]=Date.now();saveLocal('ca-completed',done);renderLearn();if(state.lesson.problem?.kind==='knowledge-topic'){returnToKnowledge();return;}practiceSource=state.lesson.problem;saveLocal('ca-practice-source',practiceSource);setView('practice')}
function stopSpeech(){globalThis.speechSynthesis?.cancel();$('speakSlide').textContent='朗读讲稿'}
function speak(){if(!state.lesson)return;if(!globalThis.speechSynthesis){toast('当前浏览器不支持朗读');return}if(speechSynthesis.speaking){stopSpeech();return}const speech=new SpeechSynthesisUtterance(state.lesson.pages[state.slide].narration);speech.lang='zh-CN';speech.rate=.95;speech.onend=speech.onerror=()=>$('speakSlide').textContent='朗读讲稿';speechSynthesis.speak(speech);$('speakSlide').textContent='停止朗读'}
async function refreshPractice(){try{const records=await api('/api/practice');state.practice=unpackPracticeRecords(records);renderPractice();if(state.view==='knowledge')renderKnowledge()}catch{renderPractice()}}
function renderPractice(){
  const p=practiceProblem();$('generateVariants').disabled=!p||!Number.isInteger(p.level);$('generateVariants').title=p&&!Number.isInteger(p.level)?'本题尚未确定 GESP 等级，可先生成讲解或直接编程。':'';
  $('practiceContext').innerHTML=p?`<span class="tiny-label">当前学习题目 · ${esc(isCspProblem(p)?classificationLabel(p):`GESP ${p.level} 级`)}</span><h3>${esc(p.title)}</h3>${tagsHtml(p)}`:'<h3>选择一道题，开始同类练习。</h3><p class="small muted">点击右侧“切换题目”，从题库或已有题目中选择。</p>';
  const list=p?recommendProblems(state.bank,p):[];
  $('recommendationList').innerHTML=list.length?list.map(item=>card(item,item.shared.length?'共同知识点：'+item.shared.join('、'):'同级拓展练习')).join(''):empty('暂无同级真题推荐','可以上传同类题，或先生成讲解后使用原创变式练习。');
  const variants=variantsForProblem(state.practice,p,[...state.lessons,state.lesson]);
  $('variantList').innerHTML=variants.length?variants.map(item=>card(item,item.casesSource)).join(''):empty('当前题目还没有变式练习',p?'点击“生成 3 道变式”，为当前题目生成练习。':'请先选择一道原题。');
}
function setUploadBusy(value){uploadBusy=value;$('questionFile').disabled=value;for(const b of $('uploadForm').querySelectorAll('[type=submit]'))b.disabled=value}
function openUpload(){uploadDraft=null;$('uploadForm').reset();$('uploadLevel').value=state.level;$('uploadStatus').textContent='图片和 PDF 识别后，请核对题面再生成课件。';setUploadBusy(false);$('uploadDialog').showModal()}
const uploadFields={uploadTitle:'title',uploadDescription:'description',uploadInput:'input',uploadOutput:'output',uploadConstraints:'constraints',uploadSampleInput:'sampleInput',uploadSampleOutput:'sampleOutput'};
function fillUpload(p){uploadDraft=p;for(const [id,key] of Object.entries(uploadFields))$(id).value=p[key]||'';$('uploadLevel').value=p.level||state.level}
async function fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('文件读取失败'));reader.readAsDataURL(file)})}
async function importFile(file){
  if(!file)return;if(file.size>8*1024*1024){toast('文件大小不能超过 8 MiB');return}
  const ext=file.name.split('.').pop().toLowerCase();$('uploadStatus').textContent='正在读取文件…';
  try{if(['json','txt','md'].includes(ext)){const text=await file.text();const p=ext==='json'?normalizeProblem(JSON.parse(text),Number($('uploadLevel').value)):normalizeProblem({title:file.name.replace(/\.[^.]+$/,''),description:text,level:Number($('uploadLevel').value)});fillUpload(p);$('uploadStatus').textContent='已读取，请核对内容后保存。'}else{if(activeTask)throw Error('请等待当前生成任务完成后再识别图片或 PDF');setUploadBusy(true);await runTask('/api/imports',{filename:file.name,contentBase64:await fileBase64(file),level:Number($('uploadLevel').value)},'import');if(!activeTask)setUploadBusy(false)}}catch(e){setUploadBusy(false);$('uploadStatus').textContent=e.message;toast(e.message)}
}
function saveUpload(event){
  event.preventDefault();if(uploadBusy)return;
  try{const raw={...(uploadDraft||{}),level:Number($('uploadLevel').value),kind:'uploaded',id:uploadDraft?.id?.startsWith('upload-')?uploadDraft.id:'upload-'+crypto.randomUUID()};for(const[id,key]of Object.entries(uploadFields))raw[key]=$(id).value;
    // Preserve explicit imported tests; if only the sample was imported, edits update it.
    if(!uploadDraft?.cases?.length || (uploadDraft.cases.length===1&&uploadDraft.cases[0].input===uploadDraft.sampleInput&&uploadDraft.cases[0].expected===uploadDraft.sampleOutput))raw.cases=[];
    raw.casesSource='上传题目练习点，请核对';raw.source={note:'用户上传题目'};const p=normalizeProblem(raw);const next=[p,...state.uploaded.filter(v=>v.id!==p.id)];if(!saveLocal('ca-uploaded',next))return;state.uploaded=next;state.cache.set(p.id,p);$('uploadDialog').close();changeLevel(p.level);toast('题目已保存到本机');if(event.submitter?.value==='generate')showGenerate(p);else{setView('library');previewProblem(p.id)}
  }catch(e){toast(e.message)}
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('button,a');if(!target)return;
  try{
    if(target.dataset.close){$(target.dataset.close).close();return}
    if(target.hasAttribute('data-start-service')){startServiceFromPage();return}
    if(target.dataset.action==='knowledge-home'){knowledgeContext=null;saveLocal('ca-knowledge',null);setView('knowledge');return;}
    if(target.dataset.view){setView(target.dataset.view);return}
    if(target.dataset.slide!==undefined){moveSlide(Number(target.dataset.slide));return}
    const action=target.dataset.action,id=target.dataset.id;
    if(action==='knowledge-level'){changeLevel(Number(target.dataset.topicLevel));knowledgeContext=null;saveLocal('ca-knowledge',null);setView('knowledge');return;}
    if(action==='knowledge'){openKnowledge(target.dataset.topic,Number(target.dataset.topicLevel));return;}
    if(action==='knowledge-part'){openKnowledge(target.dataset.topic,Number(target.dataset.topicLevel),knowledgeContext?.group);return;}
    if(action==='knowledge-generate'){const topic=target.dataset.topic,level=Number(target.dataset.topicLevel);await showGenerate(topicProblem(topic,level));$('targetLevel').value=level;$('generationRequirements').value=`按 GESP ${level} 级及前序基础讲原理、C++ 语法与小实验。每个语法页要能补写或修改代码并运行，逐项解释符号含义。不要采用解一道题的课件结构。`;return;}
    if(action==='knowledge-lesson'){await openLesson(id);knowledgeReturn=true;state.slide=topicPage(state.lesson,target.dataset.topic,knowledgeCatalog);renderLesson();setView('lesson');return;}
    if(action==='knowledge-practice'){const topic=target.dataset.topic,level=Number(target.dataset.topicLevel);if(topicProblems(state.bank,topic,level,knowledgeCatalog).single.length){renderKnowledge();return;}await runTask('/api/knowledge-practice',{topic,targetLevel:level},'topic-practice');return;}
    if(action==='upload')openUpload();
    if(action==='library-page'){libraryPageNumber=Number(target.dataset.page);renderLibrary();$('problemList').scrollTop=0;}
    if(action==='check-theory'&&state.preview?.id===id){const form=target.closest('[data-theory]');form.querySelector('.csp-answer-result').textContent=theoryFeedback(state.preview,[...form.querySelectorAll('input:checked')].map(e=>e.value));}
    if(action==='preview')await previewProblem(id);
    if(action==='code')loadWorkspace(await getProblem(id));
    if(action==='study')await showGenerate(await getProblem(id));
    if(action==='open-lesson'){if(id!==state.lesson?.id)await openLesson(id);setView('lesson')}
    if(action==='delete-lesson')await deleteLesson(id);
    if(action==='finish')finishLesson();
    if(action==='lesson-code'&&state.lesson)loadWorkspace(state.lesson.problem);
    if(action==='regenerate-lesson-code'&&state.lesson&&codeAccess.has(state.lesson.id,state.slide)){
      if(activeTask){toast('已有任务正在进行，请等待完成');return;}
      lessonRunner.forgetLesson(state.lesson.id);
      runTask('/api/lesson-code',{lessonId:state.lesson.id,pageIndex:state.slide},'lesson-code');
    }
    if(action==='lesson-original'&&state.lesson?.problem&&state.lesson.problem.kind!=='knowledge-topic'){
      if(judgeBusy){toast('请等待当前评测结束后再返回原题');return;}
      if(document.fullscreenElement)await document.exitFullscreen();
      loadWorkspace(state.lesson.problem);
      if($('workspaceProblemPanel').hidden)$('workspaceProblemToggle').click();
      $('workspaceProblem').scrollTop=0;
    }
    if(action==='unlock-lesson-code'&&state.lesson){const lesson=state.lesson,index=state.slide;if(await codeAccess.ensure(lesson,index)&&state.lesson?.id===lesson.id&&state.slide===index)renderLesson();}
    if(action==='lock-lesson-code'&&state.lesson){codeAccess.lock(state.lesson.id,state.slide);lessonRunner.forgetLesson(state.lesson.id);renderLesson();}
    if(action==='run-lesson-code'&&state.lesson)lessonRunner.open(state.lesson,state.slide);
    if(action==='code-unlock-history'&&state.lesson)await codeAccess.showHistory(state.lesson);
  }catch(e){toast(e.message)}
});
document.addEventListener('change',event=>{
  if(event.target.matches('[data-action="knowledge-level-select"]')){
    changeLevel(Number(event.target.value));knowledgeContext=null;saveLocal('ca-knowledge',null);setView('knowledge');
  }
});
$('learnLevel').onchange=e=>changeLevel(e.target.value);$('libraryLevel').onchange=e=>{if(!['csp-j','csp-s','bank','ungraded'].includes(e.target.value)){changeLevel(e.target.value);return;}libraryGroup=e.target.value;saveLocal('ca-library-group',libraryGroup);for(const id of ['sessionFilter','tagFilter','sourceFilter','weekFilter','contestGroupFilter','questionTypeFilter','bankOriginFilter','bankDifficultyFilter'])$(id).value='';renderLibrary();};for(const id of ['sessionFilter','tagFilter','sourceFilter','weekFilter','contestGroupFilter','questionTypeFilter','bankOriginFilter','bankDifficultyFilter'])$(id).onchange=renderLibrary;$('searchInput').oninput=renderLibrary;
$('browseLevel').onclick=$('allProblems').onclick=$('chooseProblem').onclick=$('chooseLessonProblem').onclick=()=>setView('library');
$('uploadBtn').onclick=openUpload;$('questionFile').onchange=e=>importFile(e.target.files[0]);$('uploadForm').onsubmit=saveUpload;
$('importJsonBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files[0];if(f){openUpload();await importFile(f)}e.target.value=''};
$('startServiceBtn').onclick=startServiceFromPage;$('startServiceDialogBtn').onclick=startServiceFromPage;
$('serviceBtn').onclick=()=>{$('serviceDialog').showModal();checkService()};$('checkService').onclick=async()=>{if(await checkService()){refreshHistory();refreshPractice();toast('已连接本地讲解服务')}};
$('analysisSettingsBtn').onclick=analysisSettings.open;$('analyzeBtn').onclick=codeAnalysis.open;$('analysisHistoryBtn').onclick=codeAnalysis.showHistory;
$('runBtn').onclick=()=>submit('run');$('debugBtn').onclick=debugWorkspace;$('judgeBtn').onclick=()=>submit('judge');$('toggleOutput').onclick=()=>toggleOutput($('outputDrawer').hidden);$('closeOutput').onclick=()=>toggleOutput(false);
$('workspaceLesson').onclick=async()=>{if(!state.activeProblem)return;const lesson=lessonForProblem(state.activeProblem);if(lesson){try{await openLesson(lesson.id);setView('lesson')}catch(e){toast(e.message)}}else showGenerate(state.activeProblem)};
$('generateForm').onsubmit=event=>{event.preventDefault();if(!generationProblem)return;const level=generationProblem.kind==='knowledge-topic'?generationProblem.level:Number($('targetLevel').value),problem=generationProblem.kind==='knowledge-topic'?topicProblem(generationProblem.tags[0],level):generationProblem;const body={problem,targetLevel:level,requirements:$('generationRequirements').value};$('generateDialog').close();runTask('/api/lessons',body,'lesson')};
$('prevSlide').onclick=()=>moveSlide(state.slide-1);$('nextSlide').onclick=()=>state.slide===state.lesson?.pages.length-1?finishLesson():moveSlide(state.slide+1);$('speakSlide').onclick=speak;
$('fullScreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('lessonPlayer').requestFullscreen()}catch{toast('当前浏览器不支持全屏')}};
$('exportLesson').onclick=async()=>{const lesson=state.lesson;if(!lesson||!await codeAccess.ensureLesson(lesson))return;if(state.lesson?.id===lesson.id)renderLesson();const url=URL.createObjectURL(new Blob([exportHtml(lesson,{includeCode:true})],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=lesson.title.replace(/[\\/:*?"<>|]/g,'_')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
$('regenerateTopicLesson').onclick=()=>{const p=state.lesson?.problem;if(p?.kind==='knowledge-topic')showGenerate(topicProblem(p.tags[0],state.lesson.targetLevel));};
$('backToKnowledge').onclick=returnToKnowledge;
$('backToCourses').onclick=()=>setView('courses');
$('coursewareLevel').onchange=()=>renderHistory(historyItems,false);$('coursewareSearch').oninput=()=>renderHistory(historyItems,false);$('coursewareReset').onclick=()=>{$('coursewareLevel').value='';$('coursewareSearch').value='';renderHistory(historyItems,false);};
$('switchPracticeProblem').onclick=()=>practicePicker.open(practiceProblem());
$('generateVariants').onclick=()=>{const p=practiceProblem();if(p)runTask('/api/practice',{problem:p},'practice');};$('taskRetry').onclick=()=>retryAction?.();$('taskDismiss').onclick=()=>$('taskPanel').hidden=true;
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));window.addEventListener('beforeunload',()=>{saveCode();stopSpeech()});
document.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;if(state.view==='lesson'&&state.lesson){if(event.key==='ArrowRight')moveSlide(state.slide+1);if(event.key==='ArrowLeft')moveSlide(state.slide-1)}});
async function boot(){
  try{const [catalog,levels,demo,knowledge,csp,bank]=await Promise.all([jsonAsset('data/gesp/index.json'),jsonAsset('data/gesp/levels.json'),jsonAsset('problem.json'),jsonAsset('data/gesp/knowledge.json'),jsonAsset('data/csp/index.json'),jsonAsset('data/xiaohou-bank/index.json')]);knowledgeCatalog=knowledge;state.bank=[...catalog.problems,...csp.problems,...bank.problems];state.levels=levels.levels;state.activeProblem=normalizeProblem({...demo,id:'demo',level:1,kind:'uploaded'});$('syllabusLink').href=levels.source;
    for(const id of ['learnLevel','libraryLevel','uploadLevel','targetLevel'])$(id).innerHTML=state.levels.map(l=>`<option value="${l.level}">GESP ${l.level} 级</option>`).join('');
    $('libraryLevel').insertAdjacentHTML('beforeend','<option value="csp-j">CSP-J</option><option value="csp-s">CSP-S</option><option value="bank">学而思题库（全部）</option><option value="ungraded">待归级／竞赛拓展</option>');
    $('sessionFilter').innerHTML='<option value="">全部场次</option>'+[...new Set(state.bank.map(p=>p.session))].sort().reverse().map(s=>`<option>${esc(s)}</option>`).join('');$('tagFilter').innerHTML='<option value="">全部知识点</option>'+[...new Set(state.bank.flatMap(p=>p.tags).filter(t=>!isSourceTag(t)))].sort().map(t=>`<option>${esc(t)}</option>`).join('');
    $('workspaceTitle').textContent=state.activeProblem.title;$('workspaceProblem').innerHTML=problemHtml(state.activeProblem);$('stdin').value=demo.sampleInput;renderLearn();renderLibrary();renderPractice();if(state.lesson)renderLesson();setView(location.hash.slice(1)||'learn');
    if(await checkService()){refreshHistory();refreshPractice();const pending=readLocal('ca-active-task',null);if(pending?.id){activeTask=pending;retryAction=null;watchTask(pending)}}
  }catch(e){$('featuredProblems').innerHTML=empty('初始化失败',e.message);toast(e.message)}
}
boot();
let serviceStatusRefresh=null;
function refreshConnectionStatus(){
  if(document.hidden||serviceStarting||serviceStatusRefresh)return;
  serviceStatusRefresh=checkService().finally(()=>{serviceStatusRefresh=null;});
}
setInterval(refreshConnectionStatus,30000);
document.addEventListener('visibilitychange',refreshConnectionStatus);
