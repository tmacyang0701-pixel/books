import {pageVisual,visualHtml} from './visuals.js';
import {pagePseudocode} from './pseudocode.js';
import {usesOriginalSample,examplesForPage,examplesHtml} from './lesson-examples.js';
import {lessonProse} from './lesson-prose.js';
import {syntaxContent} from './syntax-render.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(value) { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch { return ''; } }
export function normalizeProblem(value, fallbackLevel=5) {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('题目必须是 JSON 对象');
  const p={...value};
  p.description ??= p.statement; p.input ??= p.inputDesc; p.output ??= p.outputDesc;
  for(const key of ['title','description','input','output','constraints','sampleInput','sampleOutput']) {
    p[key] ??= '';
    if(typeof p[key]!=='string' || p[key].length>40000) throw Error(`${key} 字段无效或过长`);
  }
  if(!p.title.trim()||!p.description.trim()) throw Error('请填写标题与题干');
  p.level ??= fallbackLevel;
  if(!Number.isInteger(p.level)||p.level<1||p.level>8) throw Error('等级必须是 1～8');
  p.tags ??= [];
  if(!Array.isArray(p.tags)||p.tags.some(v=>typeof v!=='string')) throw Error('知识点必须为文本数组');
  p.cases ??= [];
  if(!Array.isArray(p.cases)||p.cases.length>30||p.cases.some(c=>!c||typeof c.input!=='string'||typeof c.expected!=='string'||!Number.isInteger(c.score)||c.score<0||c.score>100||c.input.length>20000||c.expected.length>20000)) throw Error('评测点需要 input、expected 与 0～100 的整数 score，最多 30 个');
  if(!p.cases.length && p.sampleInput && p.sampleOutput) p.cases=[{input:p.sampleInput,expected:p.sampleOutput,score:100}];
  return p;
}
export function recommendProblems(bank, problem, count=3) {
  const tags=new Set(problem.tags||[]);
  return bank.filter(p=>p.id!==problem.id&&p.level===problem.level).map(p=>({...p,shared:(p.tags||[]).filter(t=>tags.has(t))})).sort((a,b)=>b.shared.length-a.shared.length||String(b.session).localeCompare(String(a.session))).slice(0,count);
}
export function sampleReferenceHtml(problem={}) {
  const samples=[['输入',problem.sampleInput,problem.input],['输出',problem.sampleOutput,problem.output]]
    .filter(([,value])=>typeof value==='string'&&value.trim());
  if(!samples.length)return '';
  const label=typeof problem.sampleLabel==='string'&&problem.sampleLabel.trim()?problem.sampleLabel:'题目示例';
  return `<div class="lesson-sample-reference"><div class="lesson-sample-heading"><h3>原题示例参考</h3><span>${escapeHtml(problem.title||'')}</span></div><div class="lesson-sample-grid">${samples.map(([name,value,format])=>`<div class="lesson-sample-item"><h4>${escapeHtml(label)} · ${name}</h4><pre class="lesson-sample-value"><code>${escapeHtml(value)}</code></pre>${typeof format==='string'&&format.trim()?`<p class="lesson-sample-format">${lessonProse(format)}</p>`:''}</div>`).join('')}</div></div>`;
}
export function slideHtml(page,{interactive=false,lesson={},codeUnlocked=false}={}) {
  const e=escapeHtml,trace=page.trace,visual=pageVisual(page,lesson),diagram=visualHtml(visual,interactive?0:Math.max(0,(visual?.frames?.length||1)-1),{interactive});
  const examples=examplesForPage(page,lesson),includesOriginal=examples.some(example=>example.input.trim()===(lesson.problem?.sampleInput||'').trim());
  const reference=(usesOriginalSample(page,lesson)&&!includesOriginal?sampleReferenceHtml(lesson.problem):'')+examplesHtml(examples,0,0,{interactive});
  const pseudo=lesson.topicSchema>=2?null:pagePseudocode(page,lesson),pseudocode=pseudo?`<div class="slide-pseudocode"><div class="pseudocode-heading"><h3>伪代码示例</h3><span>先理解步骤，再对照下方 C++ 实现</span></div><pre><code>${e(pseudo.code)}</code></pre>${pseudo.example?`<p class="pseudocode-example"><strong>举个例子</strong>${lessonProse(pseudo.example)}</p>`:''}</div>`:'';
  const code=page.code?(codeUnlocked?`${interactive?'<div class="slide-code-toolbar"><span>C++17 · 本页示例</span><div class="button-row"><button class="ghost" data-action="code-unlock-history">解锁记录</button><button class="ghost" data-action="lock-lesson-code">重新锁定</button><button class="primary" data-action="run-lesson-code">▶ 运行代码</button></div></div>':''}<pre><code>${e(page.code)}</code></pre>`:`<div class="lesson-code-locked"><span class="code-lock-icon" aria-hidden="true">⌑</span><div><h3>完整代码已锁定</h3><p>${interactive?'先尝试根据伪代码独立实现，输入密码后可查看和运行完整 C++ 代码。':'本次导出未包含完整 C++ 代码。'}</p></div>${interactive?'<div class="button-row"><button class="ghost" data-action="code-unlock-history">解锁记录</button><button class="primary" data-action="unlock-lesson-code">输入密码查看</button></div>':''}</div>`):'';
  return `<div class="eyebrow">${e(page.kind)}</div><h2>${lessonProse(page.title)}</h2><ul>${(page.content||[]).map(v=>`<li>${lessonProse(v)}</li>`).join('')}</ul>${diagram}${syntaxContent(page,interactive,e,lessonProse)}${pseudocode}${code}${reference}${trace?.headers?.length?`<div style="overflow:auto"><table><thead><tr>${trace.headers.map(h=>`<th>${lessonProse(h)}</th>`).join('')}</tr></thead><tbody>${trace.rows.map(r=>`<tr>${r.map(c=>`<td>${lessonProse(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}`;
}
export function exportHtml(lesson,{includeCode=false}={}) {
  const e=escapeHtml;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(lesson.title)}</title><style>.lesson-inline-code{background:#edf1f8;color:#32456b;padding:2px 5px;border-radius:4px}.lesson-math-display{display:block;overflow:auto;margin:12px 0}.lesson-math math{font-size:1.05em}.lesson-sample-reference{margin:24px 0 18px;padding:17px;border:1px solid #d6e2f5;border-radius:12px;background:#fff;break-inside:avoid}.lesson-sample-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}.lesson-sample-heading h3{margin:0;font-size:14px;color:#38567e}.lesson-sample-heading span{font-size:11px;color:#7285a2;overflow-wrap:anywhere}.lesson-sample-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.lesson-sample-item{min-width:0}.lesson-sample-item h4{font-size:12px;color:#536b90;margin:0 0 8px}.lesson-sample-reference .lesson-sample-value{margin:0;padding:12px 14px;min-height:76px;max-height:190px;box-sizing:border-box;background:#f5f8fe;border:1px solid #e0e7f4;border-radius:8px;color:#233b5c;font:13px/1.8 Consolas,monospace;white-space:pre;overflow:auto}.lesson-sample-reference .lesson-sample-format{font-size:11px;line-height:1.7;color:#6c7f9e;margin:8px 0 0;white-space:pre-wrap}@media(max-width:700px){.lesson-sample-grid{grid-template-columns:1fr}.lesson-sample-heading{align-items:flex-start;flex-wrap:wrap}}@media print{.lesson-sample-reference .lesson-sample-value{max-height:none;white-space:pre-wrap}}body{margin:0;background:#edf1f8;color:#182943;font:17px/1.8 system-ui,'Microsoft YaHei',sans-serif}header,section{max-width:1020px;margin:30px auto;padding:45px;background:white;border-radius:15px}h1{font-size:34px}h2{font-size:29px}li{margin:12px 0;white-space:pre-wrap}pre{background:#142139;color:#e7eeff;padding:23px;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.65 Consolas,monospace;border-radius:10px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd6e6;padding:9px;text-align:left}.eyebrow{color:#6b72c3;font-size:13px}details{border-top:1px solid #ddd;margin-top:25px;padding-top:15px}details p{white-space:pre-wrap}.slide-pseudocode{margin:24px 0;border:1px solid #cce2dc;border-radius:12px;overflow:hidden}.pseudocode-heading{padding:14px 18px;background:#edf8f4}.pseudocode-heading h3{font-size:18px;margin:0}.pseudocode-heading span{font-size:12px;color:#52786c}.slide-pseudocode pre{margin:0;background:#fbfefd;color:#2b5147;border-radius:0;font:14px/1.8 Consolas,Microsoft YaHei,monospace}.pseudocode-example{margin:0;padding:14px 18px;background:#f0f8f5;font-size:14px}.pseudocode-example strong{display:block}.page-visual{margin:22px 0;padding:20px;border:1px solid #d6e0f3;border-radius:14px;background:#f8faff;break-inside:avoid}.visual-heading{display:flex;justify-content:space-between;align-items:center;gap:14px}.visual-heading h3{font-size:18px;margin:0 0 12px}.visual-heading span{font-size:12px;color:#64758d}.visual-stage{display:block;width:100%;height:auto;max-height:420px}.visual-caption{font-size:15px;margin:12px 0 0}a{color:#555fc3}small{color:#64758d}@media print{body{background:white}header,section{break-after:page;box-shadow:none;margin:0;border-radius:0}details{display:block}details p{display:block}}</style><header><small>CodeArena · GESP ${e(lesson.targetLevel)} 级 · ${e(lesson.model)}</small><h1>${e(lesson.title)}</h1><p>${lessonProse(lesson.summary)}</p><ol>${lesson.pages.map((p,i)=>`<li><a href="#page-${i+1}">${e(p.title)}</a></li>`).join('')}</ol><small>AI 生成讲解，教学使用前请核对题意、代码与边界情况。</small></header>${lesson.pages.map((p,i)=>`<section id="page-${i+1}"><small>${i+1} / ${lesson.pages.length}</small>${slideHtml(p,{lesson,codeUnlocked:includeCode})}<details><summary>本页讲稿</summary><p>${lessonProse(p.narration)}</p></details></section>`).join('')}</html>`;
}
