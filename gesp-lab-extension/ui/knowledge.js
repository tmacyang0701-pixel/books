import {escapeHtml as esc} from './core.js';

export const knowledgeTerms=(topic,catalog)=>[topic,...(catalog.aliases?.[topic]||[])];
export const knowledgeParts=(topic,catalog)=>catalog.groups?.[topic]||[topic];
export const knowledgeId=(topic,level)=>`knowledge-${level}-${encodeURIComponent(topic)}`;
export function knowledgeDirectoryHtml(levels,level,catalog,selected=false){
  const info=levels.find(l=>l.level===level);if(!info)return '';
  const cards=`<div class="knowledge-directory-grid">${info.topics.map(group=>`<article class="knowledge-directory-card"><h3>${esc(group)}</h3><div class="topic-list">${knowledgeParts(group,catalog).map(topic=>knowledgeTag(topic,level)).join('')}</div></article>`).join('')}</div>`;
  return `<div class="knowledge-toolbar"><div><h1>知识点讲解</h1><p>理解原理 · 学习语法 · 动手验证</p></div><label><span class="visually-hidden">知识点讲解等级</span><select data-action="knowledge-level-select">${levels.map(l=>`<option value="${l.level}" ${l.level===level?'selected':''}>GESP ${l.level} 级</option>`).join('')}</select></label></div><${selected?'details':'section'} class="knowledge-directory">${selected?`<summary>切换知识点 <span>GESP ${level} 级</span></summary>`:''}${cards}</${selected?'details':'section'}>`;
}
export function topicProblems(bank,topic,level,catalog){
  const terms=new Set(knowledgeTerms(topic,catalog)),support=new Set([...terms,...catalog.supportTags]);
  const related=bank.filter(p=>p.kind!=='theory'&&Number.isInteger(p.level)&&p.level<=level&&(p.knowledgePoints||p.tags)?.some(t=>terms.has(t))).sort((a,b)=>(b.level===level)-(a.level===level)||b.level-a.level||a.tags.length-b.tags.length||String(b.session).localeCompare(String(a.session))||a.id.localeCompare(b.id));
  return {single:related.filter(p=>(p.knowledgePoints||p.tags).every(t=>support.has(t))),related};
}
export function topicProblem(topic,level){
  return {id:knowledgeId(topic,level),kind:'knowledge-topic',title:`${topic} · 知识点讲解`,level,tags:[topic],
    description:`为 GESP C++ ${level} 级学生讲解单一知识点“${topic}”。以本级能力为上限，复习前序基础。先讲原理和内部机制，再逐项讲 C++ 声明、操作符、语句与语法含义。用 2～3 个小用例观察状态变化；每个语法页提供让学生补写几行、修改并运行的独立代码实验，写明任务、输入和预期输出。不要用一道大题或完整算法实现串起课件。例子、语法和实验都必须在本级范围内，默认使用 C++11 兼容语法。`,input:'',output:'',constraints:`GESP ${level} 级及前序知识；短小、可观察的语法实验。`,sampleInput:'',sampleOutput:'',cases:[],source:{note:'分级知识点专题与自编语法实验，不是官方真题。'}};
}
export function topicPage(lesson,topic,catalog){
  const terms=knowledgeTerms(topic,catalog);let best=-1,index=0;
  (lesson.pages||[]).forEach((p,i)=>{const title=p.title||'',body=(p.content||[]).join(' ');const score=terms.reduce((n,t)=>n+(title.includes(t)?10:0)+(body.includes(t)?1:0),0);if(score>best){best=score;index=i;}});return index;
}
export function knowledgeTag(topic,level){return `<button type="button" class="tag knowledge-tag" data-action="knowledge" data-topic="${esc(topic)}" data-topic-level="${level}" title="学习${esc(topic)}：讲解与专项练习">${esc(topic)}<span aria-hidden="true"> ↗</span></button>`;}
export function knowledgeHtml({topic,group,level,catalog,bank,lessons,generated,card}){
  const {single,related}=topicProblems(bank,topic,level,catalog),id=knowledgeId(topic,level),own=lessons.find(l=>l.problemId===id),problemIds=new Set(related.map(p=>p.id));
  const linked=lessons.filter(l=>problemIds.has(l.problemId));
  const chips=knowledgeParts(group||topic,catalog),practice=single.length?single:generated.filter(p=>p.knowledgeTopic===topic&&p.level===level);
  const topicAttrs=`data-topic="${esc(topic)}" data-topic-level="${level}"`;
  return `
    ${chips.length>1?`<nav class="knowledge-tabs" aria-label="选择单个知识点">${chips.map(t=>`<button class="${t===topic?'primary':'ghost'}" aria-pressed="${t===topic}" data-action="knowledge-part" data-topic="${esc(t)}" data-topic-level="${level}">${esc(t)}</button>`).join('')}</nav>`:''}
    <article class="knowledge-intro"><div class="knowledge-intro-copy"><span class="eyebrow">GESP ${level} 级 · 本级及前序基础</span><h2>${esc(topic)}</h2><p>弄懂为什么，再用 C++ 小实验验证。</p></div><div class="knowledge-entry">${own?`<button class="primary" data-action="knowledge-lesson" data-id="${esc(own.id)}" ${topicAttrs}>进入知识点讲解 →</button><button class="text-button" data-action="knowledge-generate" ${topicAttrs}>重新生成讲解</button>`:`<button class="primary" data-action="knowledge-generate" ${topicAttrs}>生成知识点讲解 →</button><span class="small muted">生成后保留，下次直接进入</span>`}</div><div class="knowledge-path"><span><b>01</b> 理解原理</span><span><b>02</b> 学习语法</span><span><b>03</b> 编写与运行</span></div></article>
    ${linked.length?`<section class="knowledge-related"><div class="section-heading"><h2>题目中的相关讲解</h2><span class="small muted">优先打开相关知识点所在页</span></div><div class="knowledge-lesson-links">${linked.map(l=>`<button class="lesson-link" data-action="knowledge-lesson" data-id="${esc(l.id)}" ${topicAttrs}><strong>${esc(l.title)} ↗</strong><span class="small muted">GESP ${l.targetLevel} 级 · 已有课件</span></button>`).join('')}</div></section>`:''}
    <section class="knowledge-practice"><div class="section-heading"><h2>${esc(topic)} · 专项练习</h2><span class="muted small">${single.length?'优先选自题库 · 本级优先，兼顾前序基础':practice.length?'AI 原创 · 题库暂无匹配的单点练习':'先查题库，再生成练习'}</span></div>
    ${practice.length?`<div class="problem-grid">${practice.slice(0,6).map(p=>card(p,p.knowledgeTopic?'AI 单知识点练习 · 测试点尚未独立验证':'题库专项练习 · '+(p.level===level?'本级题目':`GESP ${p.level} 级基础题`))).join('')}</div>`:`<div class="empty-state"><h3>题库暂无适合的单知识点练习</h3><p class="small">${related.length?'相关真题还涉及其他知识点，先生成只练习当前知识点的小题。':'可以生成 3 道由浅入深的小题，均围绕当前知识点。'}</p><button class="primary" data-action="knowledge-practice" ${topicAttrs}>生成 3 道专项练习</button></div>`}
    <p class="footnote">练习以当前知识点为主，可以使用基础输入输出、条件、循环和数组或字符串存储。题库题面为整理版，练习点为自编；AI 原创题另行标注。</p></section>`;
}
