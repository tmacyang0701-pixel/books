import { modules, lessons } from './curriculum.js';
import { examQuestions, examSources, examYears, examYearRange, examChapters, filterExamQuestions, gradeExamPart, examOutcome } from './exam-bank.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const statusText = { unanswered: '待作答', correct: '已掌握', review: '待复习 / 自评' };
const answerText = p => p.kind === 'choice' ? p.options[p.answer] : p.kind === 'number' ? `${p.answer} ${p.unit}` : p.answer[0];

function partMarkup(q, part, i, record) {
  const value = record.values?.[i] ?? '', id = `${q.id}-${i}`;
  if (part.kind === 'choice') return `<fieldset class="exam-part"><legend>${esc(part.label)}</legend><div class="quiz-options">${part.options.map((option, n) => `<label><input type="radio" name="${id}" data-part="${i}" value="${n}" ${value === String(n) ? 'checked' : ''} required><span class="option-letter">${String.fromCharCode(65+n)}</span><span>${esc(option)}</span></label>`).join('')}</div></fieldset>`;
  return `<label class="exam-part" for="${id}">${esc(part.label)}${part.unit ? `（${esc(part.unit)}）` : ''}<input id="${id}" name="${id}" data-part="${i}" value="${esc(value)}" type="text" maxlength="200" autocomplete="off" required placeholder="${part.kind === 'number' ? '填数值，如 42000 或 4.2e4' : '填写物理概念或方向'}"></label>`;
}

export function questionMarkup(q, record = {}) {
  const source = examSources[q.year], generated = q.kind === 'generated';
  return `<article class="exam-card" id="${q.id}" data-question="${q.id}">
    <div class="exam-meta"><strong>${generated ? `AI 原创变式 · ${esc(q.difficulty)}` : `上海 · ${q.year} 年中考 · ${source.numbering ? '整理版' : ''}第 ${esc(q.number)} 题`}</strong><span>${q.type}</span><span>${q.edition}</span>${source?.numbering ? `<span>${source.numbering}</span>` : ''}</div>
    <div class="exam-card-heading"><h2>${esc(q.title)}</h2><span class="exam-status" data-status="${examOutcome(q, record)}">${statusText[examOutcome(q, record)]}</span></div>
    <div class="exam-topics"><div class="exam-chapters"><strong>对应章节</strong>${q.lessonIds.map(id => { const l = lessons.find(item => item.id === id); return `<a href="#lesson/${id}">${esc(modules.find(m => m.id === l.module).name)} → ${esc(l.subtitle)} ↗</a>`; }).join('')}</div><div class="exam-knowledge"><strong>知识点</strong>${q.knowledgePoints.map(point => `<span>${esc(point)}</span>`).join('')}</div></div>
    ${generated ? `<p class="exam-note"><strong>变化点：</strong>${esc(q.change)}</p><details class="variant-hints"><summary>需要一点提示</summary><ul>${q.hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul></details>` : `<a class="button secondary exam-tutor-link" href="#explain/${q.id}">讲解课件与变式题 →</a>`}
    <p class="exam-stem">${esc(q.stem)}</p>
    ${q.table ? `<div class="record-table"><table><caption>实验数据</caption><thead><tr>${q.table.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${q.table.rows.map(row => `<tr>${row.map((v, i) => i === 0 ? `<th scope="row">${esc(v)}</th>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    ${q.note ? `<p class="exam-note">${esc(q.note)}</p>` : ''}
    <form class="exam-form">${q.parts.map((p, i) => partMarkup(q, p, i, record)).join('')}
      ${q.needsReview ? `<label class="exam-reasoning" for="reason-${q.id}">${esc(q.reasoning || '我的解题过程（先列公式，再代入数值和单位）')}<textarea id="reason-${q.id}" rows="3" maxlength="3000" ${q.reasoning ? 'required' : ''} placeholder="写下判断依据，提交后对照解析自评。">${esc(record.reasoning || '')}</textarea></label>` : ''}
      <div class="exam-actions"><button class="button" type="submit">提交并看解析</button><button class="button secondary" type="button" data-retry>重新作答</button></div>
    </form>
    <section class="exam-feedback" aria-label="答案与分步解析" hidden></section>
    <div class="exam-links">${generated ? `<a href="#exam/${q.sourceQuestionId}">查看关联原题 ↗</a><span>AI 原创练习，答案请结合解析核对</span>` : `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a><a href="#exam/${q.id}">本题链接 ↗</a>`}</div>
  </article>`;
}

export function mountExamBank(root, { module = '', lessonId = '', questionId, records, onChange }) {
  const selected = questionId ? examQuestions.find(q => q.id === questionId) : null;
  if (questionId && !selected) { root.innerHTML = '<div class="empty-state"><h1>没有找到这道题</h1><a class="button" href="#exams">返回上海中考题</a></div>'; return; }
  const filters = { year: '', module: modules.some(m => m.id === module) ? module : '', lesson: examChapters.some(l => l.id === lessonId && (!module || l.module === module)) ? lessonId : '', type: '', search: '' };
  root.innerHTML = `<div class="page-heading"><div><span class="eyebrow">SHANGHAI / PAST EXAM QUESTIONS</span><h1>上海中考题</h1><p>${examYearRange} 年间 · ${examYears.length} 个年份 · ${examQuestions.length} 道选编 · 逐题标注年份、题号与知识点</p></div><a class="text-link" href="#${selected?.module || filters.module || 'acoustics'}">返回学习路径 ↗</a></div>
    <p class="exam-intro">选自历年上海中考物理公开整理版，题干为便于在线作答作了改述，保留所列条件与数值；解析为本项目编写。${selected ? '<a href="#exams">查看全部题目 →</a>' : '先独立作答，再看解析和易错点。'}</p>
    <details class="exam-source-note"><summary>题目来源与收录范围</summary><p>这是历年题目的节选与改述，不是整套试卷，也不是考试院官方发布版本。部分题目的选项、设问形式经调整以便在线作答，请通过每题链接核对来源。2018 年采用回忆整理版题号，已单独标注。对应章节使用本应用课程目录，不代表某一版教材的章次；综合题可跨章节、跨模块。题目与解析可离线使用，来源链接需要联网。</p></details>
    ${selected ? '' : `<form class="exam-filters" aria-label="筛选上海中考题">
      <label>年份<select name="year"><option value="">全部年份</option>${examYears.map(y => `<option value="${y}">${y} 年</option>`).join('')}</select></label>
      <label>知识模块<select name="module"><option value="">全部模块</option>${modules.map(m => `<option value="${m.id}" ${filters.module === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
      <label class="exam-chapter-filter">对应章节<select name="lesson"></select></label>
      <label>题型<select name="type"><option value="">全部题型</option>${[...new Set(examQuestions.map(q => q.type))].map(t => `<option>${t}</option>`).join('')}</select></label>
      <label class="exam-search">关键词<input name="search" type="search" placeholder="搜索题干、章节或知识点…"></label>
      <button class="button secondary" type="reset">清除筛选</button></form>`}
    <p class="exam-summary" role="status" aria-live="polite"></p><nav class="exam-pagination exam-pagination-top" aria-label="题目翻页"></nav><div class="exam-list"></div><nav class="exam-pagination" aria-label="底部题目翻页"></nav>`;
  let displayed = [], matched = [], page = 1;
  const pageSize = 10;
  const listRoot = root.querySelector('.exam-list');
  const updateSummary = () => {
    const done = matched.filter(q => records[q.id]?.submitted).length;
    const mastered = matched.filter(q => examOutcome(q, records[q.id]) === 'correct').length;
    root.querySelector('.exam-summary').textContent = `筛选到 ${matched.length} 道 / 题库共 ${examQuestions.length} 道 · 当前 ${displayed.length} 道 · 筛选内已提交 ${done} 道 · 已掌握 ${mastered} 道`;
  };
  function draw() {
    matched = selected ? [selected] : filterExamQuestions(filters);
    const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
    page = Math.min(page, pageCount);
    displayed = matched.slice((page - 1) * pageSize, page * pageSize);
    root.querySelectorAll('.exam-pagination').forEach(nav => {
      nav.hidden = pageCount <= 1;
      nav.innerHTML = `<button class="button secondary" type="button" data-page="-1" ${page === 1 ? 'disabled' : ''}>上一页</button><span>第 ${page} / ${pageCount} 页 · 每页 ${pageSize} 道</span><button class="button secondary" type="button" data-page="1" ${page === pageCount ? 'disabled' : ''}>下一页</button>`;
      nav.querySelectorAll('button').forEach(button => button.onclick = () => {
        const direction = button.dataset.page;
        page += Number(direction); draw();
        const topNav = root.querySelector('.exam-pagination');
        const target = topNav.querySelector(`[data-page="${direction}"]:not(:disabled)`) || topNav.querySelector('button:not(:disabled)');
        target?.focus({ preventScroll: true });
        listRoot.style.scrollMarginTop = `${52 + topNav.offsetHeight + 14}px`;
        listRoot.scrollIntoView({ block: 'start' });
      });
    });
    listRoot.innerHTML = displayed.length ? displayed.map(q => questionMarkup(q, records[q.id])).join('') : '<div class="empty-state">没有符合条件的题目，试试其他年份或清除筛选。</div>';
    bindQuestionCards(listRoot, displayed, records, onChange, updateSummary);
    updateSummary();
  }
  const filterForm = root.querySelector('.exam-filters');
  if (filterForm) {
    const updateChapters = () => {
      const chapters = examChapters.filter(l => !filters.module || l.module === filters.module);
      if (!chapters.some(l => l.id === filters.lesson)) filters.lesson = '';
      filterForm.elements.namedItem('lesson').innerHTML = '<option value="">全部章节</option>' + chapters.map(l => `<option value="${l.id}" ${filters.lesson === l.id ? 'selected' : ''}>${esc(modules.find(m => m.id === l.module).name)} · ${esc(l.subtitle)}（${filterExamQuestions({ lesson: l.id }).length} 道）</option>`).join('');
    };
    updateChapters();
    filterForm.onsubmit = e => e.preventDefault();
    filterForm.oninput = event => { for (const key of Object.keys(filters)) filters[key] = filterForm.elements.namedItem(key).value; if (event.target.name === 'module') updateChapters(); page = 1; draw(); };
    filterForm.onreset = e => { e.preventDefault(); for (const key of Object.keys(filters)) { filters[key] = ''; filterForm.elements.namedItem(key).value = ''; } updateChapters(); page = 1; draw(); };
  }
  draw();
}

export function bindQuestionCards(root, questions, records, onChange, updateSummary = () => {}) {
  function showFeedback(card, q, announce = false) {
    const record = records[q.id], panel = card.querySelector('.exam-feedback');
    const outcome = examOutcome(q, record), status = card.querySelector('.exam-status');
    status.dataset.status = outcome; status.textContent = statusText[outcome];
    panel.hidden = !record?.submitted;
    if (!record?.submitted) { panel.innerHTML = ''; updateSummary(); return; }
    const allCorrect = q.parts.every((p, i) => gradeExamPart(p, record.values[i]));
    panel.innerHTML = `<h3 tabindex="-1">${allCorrect ? (q.needsReview ? '数值 / 选项已核对，请自评推理过程' : '回答正确') : '还有需要复习的地方'}</h3><ul class="exam-results">${q.parts.map((p, i) => `<li class="${gradeExamPart(p, record.values[i]) ? 'is-correct' : 'is-incorrect'}">${gradeExamPart(p, record.values[i]) ? '✓' : '✕'} ${esc(p.label)}：${esc(answerText(p))}</li>`).join('')}</ul><h4>分步解析</h4><ol>${q.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="exam-pitfall"><strong>易错点：</strong>${esc(q.pitfall)}</p>
      ${q.needsReview ? `<p>自动核对只检查数值和选项，推理与书写过程请对照上述步骤自评。</p><div class="exam-actions"><button class="button secondary" type="button" data-review="yes" aria-pressed="${record.review === true}">我的过程完整，已理解</button><button class="button secondary" type="button" data-review="no" aria-pressed="${record.review === false}">仍需复习</button></div>` : ''}`;
    panel.querySelectorAll('[data-review]').forEach(button => button.onclick = () => {
      record.review = button.dataset.review === 'yes'; onChange(); showFeedback(card, q);
      panel.querySelector(`[data-review="${button.dataset.review}"]`).focus();
    });
    updateSummary();
    if (announce) panel.querySelector('h3').focus();
  }
    for (const q of questions) {
      const card = root.querySelector(`[data-question="${q.id}"]`), form = card.querySelector('form');
      const readDraft = () => ({ values: q.parts.map((p, i) => (p.kind === 'choice' ? form.querySelector(`[data-part="${i}"]:checked`) : form.querySelector(`[data-part="${i}"]`))?.value || ''), reasoning: form.querySelector('textarea')?.value || '', submitted: false, review: false });
      form.oninput = () => { records[q.id] = readDraft(); onChange(); showFeedback(card, q); };
      form.onsubmit = event => { event.preventDefault(); records[q.id] = { ...readDraft(), submitted: true }; onChange(); showFeedback(card, q, true); };
      form.querySelector('[data-retry]').onclick = () => {
        delete records[q.id]; onChange();
        form.querySelectorAll('input').forEach(input => { if (input.type === 'radio') input.checked = false; else input.value = ''; });
        const reasoning = form.querySelector('textarea'); if (reasoning) reasoning.value = '';
        showFeedback(card, q); form.querySelector('input').focus();
      };
      showFeedback(card, q);
    }
}
