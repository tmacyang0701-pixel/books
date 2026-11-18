const PREFIX='huhua:';
export function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(PREFIX+key));return v??fallback;}catch{return fallback;}}
export function save(key,value){try{localStorage.setItem(PREFIX+key,JSON.stringify(value));return true;}catch{return false;}}
export function download(name,value,type='application/json'){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function collectLearningData(){return{schema:1,createdAt:new Date().toISOString(),mastery:read('mastery',{}),quiz:read('quiz',{}),notes:read('notes',{}),labConclusions:read('labConclusions',{}),reports:read('reports',[])};}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function invalid(){throw Error('学习记录格式不完整或内容超出范围，原记录未修改。');}
function string(v,max=3000){if(typeof v!=='string'||v.length>max)invalid();return v;}
function array(v,max){if(!Array.isArray(v)||v.length>max)invalid();return v;}
function number(v){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)invalid();return v;}
function tree(v,depth=0){if(depth>10)invalid();if(v===null||typeof v==='boolean')return v;if(typeof v==='number')return number(v);if(typeof v==='string')return string(v,5000);if(Array.isArray(v))return array(v,100).map(x=>tree(x,depth+1));if(!object(v)||Object.keys(v).length>100)invalid();const out={};for(const[k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))invalid();out[k]=tree(x,depth+1);}return out;}
function readings(v){return array(v,40).map(r=>{if(!object(r))invalid();return{label:string(r.label,200),value:typeof r.value==='number'?number(r.value):string(r.value,1000),unit:string(r.unit,100)};});}
function report(r,labIds){if(!object(r)||!labIds.has(r.labId)||!Number.isFinite(Date.parse(r.createdAt)))invalid();const out=tree(r);out.labName=string(r.labName,200);out.createdAt=string(r.createdAt,80);out.conclusion=string(r.conclusion??'',3000);out.modelNote=string(r.modelNote??'',3000);out.criteria=array(r.criteria,30).map(c=>{if(!object(c)||typeof c.met!=='boolean')invalid();return{label:string(c.label,500),met:c.met};});out.observations=array(r.observations,30).map(o=>{if(!object(o))invalid();return{...tree(o),time:number(o.time),note:string(o.note??'',1500),readings:readings(o.readings)};});out.log=array(r.log,80).map(l=>{if(!object(l))invalid();return{at:number(l.at),kind:string(l.kind,80),text:string(l.text,3000)};});if(r.alerts!==undefined)array(r.alerts,30);if(r.examEvents!==undefined)out.examEvents=array(r.examEvents,30).map(v=>{if(!object(v)||!['failed','observation'].includes(v.outcome))invalid();return{at:number(v.at),source:string(v.source,120),target:string(v.target,120),point:string(v.point,2000),message:string(v.message,3000),outcome:v.outcome};});return out;}
export function importLearningData(value,topicIds,labIds){
 if(!object(value)||value.schema!==1)throw Error('不是此扩展导出的学习记录。');
 for(const k of['mastery','quiz','notes'])if(!object(value[k]))invalid();
 const notes={},mastery={},quiz={},labConclusions={};
 for(const[id,v]of Object.entries(value.notes))if(topicIds.has(id))notes[id]=string(v,10000);
 for(const[id,v]of Object.entries(value.mastery))if(topicIds.has(id)){if(typeof v!=='boolean')invalid();mastery[id]=v;}
 for(const[id,v]of Object.entries(value.quiz))if(topicIds.has(id)){if(!object(v)||typeof v.correct!=='boolean')invalid();quiz[id]={correct:v.correct,at:number(v.at)};}
 if(value.labConclusions!==undefined){if(!object(value.labConclusions))invalid();for(const[id,v]of Object.entries(value.labConclusions))if(labIds.has(id))labConclusions[id]=string(v,3000);}
 const reports=array(value.reports,100).map(r=>report(r,labIds));
 const entries=Object.entries({notes,mastery,quiz,labConclusions,reports}).map(([k,v])=>[PREFIX+k,JSON.stringify(v)]),before=entries.map(([k])=>[k,localStorage.getItem(k)]);
 // Validate everything first. If quota is reached, restore the exact previous values.
 try{for(const[k,v]of entries)localStorage.setItem(k,v);}catch{for(const[k]of entries)localStorage.removeItem(k);for(const[k,v]of before)if(v!==null)localStorage.setItem(k,v);throw Error('浏览器存储不足，导入已撤回；原学习记录保留。');}
 return true;
}
