import {escapeHtml as esc,safeUrl} from './core.js';
import {lessonProse} from './lesson-prose.js';

export const isCspProblem = p => ['csp-j','csp-s'].includes(p?.group)||p?.collection==='xiaohou-bank';
export const isTheoryProblem = p => isCspProblem(p) && p.kind==='theory';
export const cspPeriods = p => [...new Set((p.occurrences||[]).map(r=>r.periodLabel))];
export const classificationLabel=p=>p.level?`GESP ${p.level} 级（${p.levelStatus||'学习参考'}）`:p.levelStatus||'待归级';
export const problemGroupLabel=p=>['csp-j','csp-s'].includes(p.group)?p.group.toUpperCase():'学而思题库';

export function contestProse(value='') {
  return String(value).split(/(!\[[^\]]*\]\([^)]+\))/g).map(part=>{
    const image=/^!\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
    if(!image)return lessonProse(part);
    if(!/^data\/(csp|xiaohou-bank)\/assets\/images\/[a-f0-9]+\.(png|jpg|jpeg|gif|webp|svg)$/.test(image[2])){
      const url=safeUrl(image[2]);
      return url?`<a class="csp-image-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">查看原题配图（未缓存） ↗</a>`:esc(part);
    }
    return `<img class="csp-statement-image" src="${esc(image[2])}" alt="${esc(image[1]||'题目配图')}" loading="lazy">`;
  }).join('');
}

export function cspDetails(p) {
  const origins=(p.occurrences||[]).map(r=>`${r.periodLabel} · ${r.group} · 第 ${r.number} 题`);
  const provenance=origins.length?`<details class="problem-section csp-provenance"><summary>所属赛事与题号（${origins.length} 处）</summary><ul>${origins.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></details>`:'';
  const classification=`<section class="csp-classification"><strong>${esc(classificationLabel(p))} · ${esc(p.cspDifficulty||problemGroupLabel(p))}</strong><p>${esc(p.levelBasis||'按主要知识点归类。')}</p><small>${p.collection==='xiaohou-bank'?esc(`原题源：${p.bankOrigin||'未标注'} · 原题号：${p.bankCode||'未标注'}。${p.groupBasis||''}`):'根据解题知识点与数据范围整理，非官方评级。赛事原组别见下方。'}</small></section>`;
  let body=`${classification}${provenance}<div class="problem-section problem-prose">${contestProse(p.description)}</div>`;
  if(p.collection==='xiaohou-bank')body=`<p class="small muted">本地评测仅按公开样例文本比对；交互题、提交答案题和特殊判题需按原平台要求完成。</p>`+body;
  if(isTheoryProblem(p)){
    const multiple=(p.answer||[]).length>1;
    body+=`<form class="csp-theory-options" data-theory="${esc(p.id)}">${(p.options||[]).map(o=>`<label><input type="${multiple?'checkbox':'radio'}" name="theory-answer" value="${esc(o.label)}"><strong>${esc(o.label)}</strong><span class="problem-prose">${contestProse(o.text)}</span></label>`).join('')}<button type="button" class="primary" data-action="check-theory" data-id="${esc(p.id)}">核对答案</button><p class="csp-answer-result" role="status" aria-live="polite"></p></form>`;
    if(p.analysis)body+=`<details><summary>解析</summary><div class="problem-prose">${contestProse(p.analysis)}</div></details>`;
  }else{
    body+=[['输入格式',p.input],['输出格式',p.output],['数据范围',p.constraints]].map(([title,text])=>text?`<section class="problem-section"><h3>${title}</h3><div class="problem-prose">${contestProse(text)}</div></section>`:'').join('');
    if(p.tips)body+=`<details class="problem-section"><summary>补充说明与样例解释</summary><div class="problem-prose">${contestProse(p.tips)}</div></details>`;
  }
  return body;
}

export function theoryFeedback(problem,selected) {
  const answer=[...new Set(problem.answer||[])].sort();
  if(!answer.length)return '平台未提供标准答案。';
  if(!selected.length)return '请先选择答案。';
  return JSON.stringify([...new Set(selected)].sort())===JSON.stringify(answer)
    ? '回答正确。' : `再核对一下题意，标准答案：${answer.join('、')}。`;
}
