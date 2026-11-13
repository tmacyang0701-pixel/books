import { standard, modules, lessons } from './curriculum.js';
import { World, forkScene, vacuumScene, waveScene } from './world.js';
import { experiments, mountLab } from './lab.js';

const main = document.querySelector('#main');
const storageKey = 'physics-lab-learning-v1';
let cleanup = () => {}, toastTimer, state = { completed: [], answers: {}, notes: {} }, storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved && typeof saved === 'object') {
    state.completed = Array.isArray(saved.completed) ? [...new Set(saved.completed.filter(id => lessons.some(x => x.id === id)))] : [];
    for (const lesson of lessons) {
      const answer = saved.answers?.[lesson.id];
      if (Number.isInteger(answer) && answer >= 0 && answer < lesson.question.options.length) state.answers[lesson.id] = answer;
    }
    for (const exp of experiments) if (typeof saved.notes?.[exp.id] === 'string') state.notes[exp.id] = saved.notes[exp.id].slice(0,2000);
  }
} catch { storageAvailable = false; }

function toast(text) {
  const node = document.querySelector('#toast'); clearTimeout(toastTimer); node.textContent = text; node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 3200);
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; return true; }
  catch { storageAvailable = false; toast('本机存储不可用，本次学习可继续，进度暂未保存。'); return false; }
}
const icons = {
  sound: '<path d="M3 10v4m4-7v10m5-14v18m5-15v12m4-9v6"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  heat: '<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z"/><path d="M12 9v9"/>',
  force: '<path d="m3 17 6-10 5 8 7-12m-5 0h5v5M3 21h18"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
  magnet: '<path d="M4 3v10a8 8 0 0 0 16 0V3h-5v10a3 3 0 0 1-6 0V3H4Zm0 5h5m6 0h5"/>',
  energy: '<path d="M20 3C8 2 2 9 5 16s14 4 15-13ZM4 21 15 10"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
const icon = name => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sound}</svg>`;
const source = lesson => `<a class="source-link" href="${standard.url}#page=${lesson.page}" target="_blank" rel="noopener noreferrer">课标 ${lesson.code} · 原书第 ${lesson.page-7} 页 ↗</a>`;
const moduleNav = document.querySelector('#module-nav');
document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); main.focus(); main.scrollIntoView(); });
moduleNav.innerHTML = modules.map((m,i) => `<a href="#${m.id}" data-module="${m.id}" class="module-link">${icon(m.icon)}<span>${m.name}</span><span class="nav-meta">${m.ready ? '学习中' : String(i+1).padStart(2,'0')}</span></a>`).join('');

function tabs(active) {
  return `<nav class="content-tabs" aria-label="声学内容"><a href="#acoustics" ${active === 'learn' ? 'aria-current="page"' : ''}>学习路径<span>08</span></a><a href="#experiments" ${active === 'lab' ? 'aria-current="page"' : ''}>3D 实验室<span>03</span></a><a href="#practice" ${active === 'quiz' ? 'aria-current="page"' : ''}>随堂自测<span>08</span></a></nav>`;
}
function acousticHeading() {
  return `<div class="page-heading"><div><div class="eyebrow">CHAPTER 01 / ACOUSTICS</div><h1>声学<span class="heading-dot">.</span></h1><p>从一场振动出发，理解我们听见的世界。</p></div><div class="learning-progress"><span><strong>${state.completed.length}</strong> / ${lessons.length}</span><small>已学课程</small><progress max="${lessons.length}" value="${state.completed.length}" aria-label="已学课程进度"></progress></div></div>`;
}
function renderOverview() {
  main.innerHTML = acousticHeading() + `<section class="hero"><div class="hero-copy"><span class="pill">从现象走向原理</span><h2>听见世界，<br>也<span>看见声音。</span></h2><p>拨动琴弦，轻敲音叉，抽走空气。<br>在一次次观察与对照中，发现声音的秘密。</p><div class="hero-actions"><a class="button" href="#lesson/${lessons.find(x => !state.completed.includes(x.id))?.id || 'vibration'}">${state.completed.length ? '继续学习' : '开始学习'} ${icon('arrow')}</a><a class="text-link" href="#experiments">先去做实验 ↗</a></div><div class="hero-facts"><span><strong>8</strong> 节知识讲解</span><span><strong>3</strong> 个三维实验</span><span>无需联网</span></div></div><div class="hero-art"><div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><canvas id="hero-world" tabindex="0" aria-label="音叉与悬球三维模型，可以拖拽旋转"></canvas><span class="art-label">振动，是声音的起点。</span><span class="art-hint">拖动，换个角度观察 ↗</span><p id="hero-fallback" hidden>音叉振动 → 悬球被弹开 → 观察振动证据<br>当前设备无法显示 3D，可继续阅读课程。</p></div></section>` + tabs('learn') + `<div class="section-top"><div><h2>你的声学学习路径</h2><p>先认识现象，再控制变量，最后回到生活。</p></div><label class="search-box"><span aria-hidden="true">⌕</span><input type="search" id="lesson-search" placeholder="查找知识点" aria-label="查找声学知识点"></label></div><div class="lesson-grid" id="lesson-grid"></div><div class="curriculum-note"><span class="note-mark">▤</span><div><strong>与课标同行</strong><p>围绕 2.3.1「声的产生和传播条件」与 2.3.2「声的特性、应用及噪声控制」展开。</p></div><a href="#curriculum">查看知识地图 ↗</a></div>`;
  const grid = document.querySelector('#lesson-grid');
  function cards(query = '') {
    const found = lessons.filter(x => `${x.title} ${x.subtitle} ${x.summary} ${x.sections.map(s=>s.text).join(' ')}`.includes(query.trim()));
    grid.innerHTML = found.length ? found.map(l => {
      const n = lessons.indexOf(l)+1, done = state.completed.includes(l.id);
      return `<a class="lesson-card" href="#lesson/${l.id}"><div class="card-top"><span class="lesson-number">${String(n).padStart(2,'0')}</span><span class="lesson-kind ${done ? 'done' : ''}">${done ? '✓ 已学习' : l.lab ? '3D 实验' : '知识应用'}</span></div><span class="lesson-subtitle">${l.subtitle}</span><h3>${l.title}</h3><p>${l.summary}</p><div class="card-bottom"><span>约 ${l.minutes} 分钟</span><span aria-hidden="true">↗</span></div></a>`;
    }).join('') : '<p class="empty-state">没有匹配的知识点，试试“振动”“音调”或“噪声”。</p>';
  }
  cards(); document.querySelector('#lesson-search').addEventListener('input', e => cards(e.target.value));
  const world = new World(document.querySelector('#hero-world'), status => { document.querySelector('#hero-fallback').hidden = status === 'ready'; });
  world.camera = [.3,.2,8.4]; world.update(forkScene(0, false));
  cleanup = () => world.dispose();
}

function renderExperiments() {
  main.innerHTML = acousticHeading() + tabs('lab') + `<div class="section-top"><div><h2>把问题，交给实验。</h2><p>每一步都有操作、观察和结论。先预测，再动手。</p></div><span class="muted">旋转 · 缩放 · 分步对照</span></div><div class="experiment-grid">${experiments.map(e => `<a href="#lab/${e.id}" class="experiment-card"><div class="experiment-illustration experiment-${e.id}"><canvas id="preview-${e.id}" aria-hidden="true"></canvas><small>实验 ${e.number}</small><span class="preview-fallback" id="preview-error-${e.id}" hidden>3D 预览暂不可用</span></div><div class="experiment-copy"><span class="lesson-subtitle">${e.subtitle}</span><h3>${e.title}</h3><p>${e.description}</p><div class="experiment-tags">${e.tags.map(t=>`<span>${t}</span>`).join('')}</div><div class="card-bottom"><span>进入实验</span>${icon('arrow')}</div></div></a>`).join('')}</div><p class="bottom-note">实验为教学模拟，不能代替真实实验测量。试听需主动开启，切换实验或离开页面会停止。</p>`;
  const previews = experiments.map(e => {
    const world = new World(document.querySelector('#preview-'+e.id), status => { document.querySelector('#preview-error-'+e.id).hidden = status === 'ready'; });
    world.camera = [.32,.28,10.5]; world.update(e.id === 'fork' ? forkScene(0,false) : e.id === 'vacuum' ? vacuumScene(0,100) : waveScene(0,220,.35,'pure')); return world;
  });
  cleanup = () => previews.forEach(world=>world.dispose());
}

function renderLab(id, focus) {
  const e = experiments.find(x => x.id === id);
  if (!e) { renderNotFound(); return; }
  main.innerHTML = `<div class="back-row"><a href="#experiments">← 全部实验</a><a href="#lesson/${e.lesson}">阅读相关知识 ↗</a></div><section class="lab" id="lab-root"></section>`;
  cleanup = mountLab(document.querySelector('#lab-root'), id, { focus: Number.isInteger(focus) && focus >= 0 ? focus : 0, note: state.notes[id] || '', saveNote(value) { state.notes[id] = value; return save(); }, toast });
}

function quizMarkup(lesson) {
  const q = lesson.question;
  return `<form class="quiz" data-quiz="${lesson.id}"><span class="eyebrow">检查一下理解</span><fieldset><legend>${q.prompt}</legend><div class="quiz-options">${q.options.map((option,i) => `<label><input type="radio" name="answer-${lesson.id}" value="${i}" required><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${option}</span></label>`).join('')}</div></fieldset><button class="button secondary" type="submit">检查答案</button><div class="quiz-feedback" role="status" hidden></div></form>`;
}
function wireQuizzes() {
  main.querySelectorAll('[data-quiz]').forEach(form => {
    const lesson = lessons.find(x => x.id === form.dataset.quiz);
    function result(answer) {
      const feedback = form.querySelector('.quiz-feedback'), correct = answer === lesson.question.answer;
      feedback.hidden = false; feedback.classList.toggle('correct', correct);
      feedback.textContent = `${correct ? '回答正确。' : `再想一想，正确选项是 ${String.fromCharCode(65+lesson.question.answer)}。`} ${lesson.question.explanation}`;
    }
    const answer = state.answers[lesson.id];
    if (answer !== undefined) { form.querySelector(`input[value="${answer}"]`).checked = true; result(answer); }
    form.addEventListener('change', () => { form.querySelector('.quiz-feedback').hidden = true; });
    form.addEventListener('submit', e => {
      e.preventDefault(); const selected = form.querySelector('input:checked'); if (!selected) return;
      state.answers[lesson.id] = Number(selected.value); save(); result(Number(selected.value));
      const score = main.querySelector('#quiz-score');
      if (score) score.textContent = `${lessons.filter(x=>state.answers[x.id] === x.question.answer).length} / 8`;
    });
  });
}

function renderLesson(id) {
  const l = lessons.find(x => x.id === id);
  if (!l) { renderNotFound(); return; }
  const i = lessons.indexOf(l), done = state.completed.includes(id);
  main.innerHTML = `<div class="back-row"><a href="#acoustics">← 声学学习路径</a><span>第 ${String(i+1).padStart(2,'0')} 节 / 08</span></div><div class="lesson-heading"><span class="eyebrow">${l.subtitle} · 约 ${l.minutes} 分钟</span><h1>${l.title}</h1><p>${l.goal}</p>${source(l)}</div><div class="reading-layout"><article class="reading-content">${l.sections.map((s,n)=>`<section class="knowledge-section"><span class="section-number">${String(n+1).padStart(2,'0')}</span><div><h2>${s.title}</h2><p>${s.text}</p></div></section>`).join('')}${l.formula ? `<div class="formula-card"><strong>${l.formula.expression}</strong><span>${l.formula.caption}</span></div>` : ''}${l.example ? `<section class="example-card"><h2>${l.example.title}</h2><p>${l.example.question}</p><h3>解题思路</h3><ol>${l.example.steps.map(s=>`<li>${s}</li>`).join('')}</ol></section>` : ''}<div class="takeaway"><span aria-hidden="true">✦</span><p>${l.takeaway}</p></div><div class="pitfall"><strong>分清这一点</strong><p>${l.pitfall}</p></div>${id === 'echo' ? '<section class="mini-tool"><h2>回声测距计算器</h2><p>声源与接收者在同一位置，障碍物静止，往返声速相同。</p><div class="calculator-fields"><label>往返时间（s）<input id="echo-time" type="number" min="0.01" max="60" step="0.01" value="0.80"></label><label>给定声速<select id="echo-speed"><option value="340">空气约 15 ℃：340 m/s</option><option value="1500">水中示例：1500 m/s</option></select></label></div><output id="echo-result" aria-live="polite"></output><small>水中声速只是本例给定值，实际随温度等条件变化。</small></section>' : ''}${id === 'noise' ? '<section class="mini-tool"><h2>把措施放在合适的位置</h2><div class="noise-options"><button data-noise="source" class="button secondary">设备减振</button><button data-noise="path" class="button secondary">安装隔声窗</button><button data-noise="ear" class="button secondary">佩戴耳罩</button></div><p id="noise-result" aria-live="polite">选择一个措施，看看它作用于传播链条的哪个位置。</p></section>' : ''}${quizMarkup(l)}<div class="lesson-complete"><button id="complete-lesson" class="button" aria-pressed="${done}">${done ? '✓ 已标记学完' : '标记为已学完'}</button><a class="text-link" href="${i < lessons.length-1 ? '#lesson/'+lessons[i+1].id : '#practice'}">${i < lessons.length-1 ? '下一节：'+lessons[i+1].subtitle : '完成学习，去自测'} →</a></div></article><aside class="reading-aside">${l.lab ? `<a href="#lab/${l.lab}/${l.labFocus || 0}" class="lab-invite"><span class="invite-symbol" aria-hidden="true">∿</span><span class="pill">动手探索</span><h3>${experiments.find(e=>e.id === l.lab).subtitle}</h3><p>${l.summary}</p><span class="button">进入 3D 实验 ${icon('arrow')}</span></a>` : ''}<div class="activity-card"><span class="eyebrow">试一试</span><p>${l.activity}</p></div><nav class="lesson-outline" aria-label="其他声学课程">${lessons.map((item,n)=>`<a href="#lesson/${item.id}" ${item.id === id ? 'aria-current="page"' : ''}><span>${String(n+1).padStart(2,'0')}</span>${item.subtitle}</a>`).join('')}</nav></aside></div>`;
  wireQuizzes();
  document.querySelector('#complete-lesson').addEventListener('click', e => {
    if (!state.completed.includes(id)) state.completed.push(id);
    const persisted = save(); e.currentTarget.textContent = '✓ 已标记学完'; e.currentTarget.setAttribute('aria-pressed','true'); if (persisted) toast('已保存学习进度。');
  });
  if (id === 'echo') {
    const input = main.querySelector('#echo-time'), select = main.querySelector('#echo-speed'), output = main.querySelector('#echo-result');
    const calculate = () => { const t = Number(input.value), v = Number(select.value); output.textContent = !input.value || !input.validity.valid || !Number.isFinite(t) ? '请输入 0.01～60 s 的有效往返时间。' : `距离 = ${v} × ${t} ÷ 2 = ${Number((v*t/2).toFixed(3))} m`; };
    input.addEventListener('input',calculate); select.addEventListener('change',calculate); calculate();
  }
  if (id === 'noise') main.querySelectorAll('[data-noise]').forEach(button => button.addEventListener('click', () => {
    main.querySelectorAll('[data-noise]').forEach(b=>b.setAttribute('aria-pressed',String(b === button)));
    main.querySelector('#noise-result').textContent = { source: '声源处：设备减振，减少产生的噪声。', path: '传播途径中：隔声窗减弱传入室内的声音。', ear: '人耳处：防护耳罩减弱进入耳朵的声音。' }[button.dataset.noise];
  }));
}

function renderPractice() {
  const score = lessons.filter(x => state.answers[x.id] === x.question.answer).length;
  main.innerHTML = acousticHeading() + tabs('quiz') + `<div class="section-top"><div><h2>不只记住，更要理解。</h2><p>每题检查后显示解析。可以修改选项，再次作答。</p></div><div class="quiz-score"><strong id="quiz-score">${score} / 8</strong><span>最近一次作答正确数</span></div></div><div class="practice-grid">${lessons.map(l=>`<section class="practice-card"><a class="practice-lesson" href="#lesson/${l.id}">${l.subtitle} ↗</a>${quizMarkup(l)}</section>`).join('')}</div>`;
  wireQuizzes();
}

function topicMarkup(m) {
  return m.topics.map(t => `<section class="topic-card"><div class="topic-header"><h3>${t.title}</h3><a href="${standard.url}#page=${t.page}" target="_blank" rel="noopener noreferrer">${t.code} ↗</a></div><ul>${t.points.map(p=>`<li>${p}</li>`).join('')}</ul></section>`).join('');
}
function renderModule(id) {
  const m = modules.find(x=>x.id === id);
  if (!m) { renderNotFound(); return; }
  main.innerHTML = `<div class="page-heading"><div><span class="eyebrow">PHYSICS / KNOWLEDGE MAP</span><h1>${m.name}<span class="heading-dot">.</span></h1><p>${m.subtitle}</p></div><span class="pill outline">知识目录</span></div><div class="module-scope"><strong>本模块已整理知识目录</strong><p>本版先完整制作声学。下面是按课标整理的学习范围，${m.name}讲解、练习与实验尚未制作。</p><a href="#acoustics" class="text-link">前往声学学习 →</a></div><div class="topic-grid">${topicMarkup(m)}</div><p class="bottom-note">条款编号对应原课标；点击编号可查看原文。实验探究与跨学科实践贯穿各模块。</p>`;
}
function renderCurriculum() {
  main.innerHTML = `<div class="page-heading"><div><span class="eyebrow">CURRICULUM / 2022</span><h1>课标与知识地图<span class="heading-dot">.</span></h1><p>用熟悉的学科模块组织学习，保留与原课标的联系。</p></div><a class="button secondary" href="${standard.url}" target="_blank" rel="noopener noreferrer">打开课标原文 ↗</a></div><div class="standards-explainer"><h2>五个课标主题，七个学习入口</h2><p>原课标的一级主题是下列五项。“声学、光学、热学、力学、电学、磁学、能源”是本应用按学习习惯整理的导航，不是课标的原始一级分类。</p><div class="theme-list">${standard.themes.map(t=>`<span>${t}</span>`).join('')}</div><p>实验探究与跨学科实践贯穿各模块。声学里的音叉和真空罩对应 2.3.1 的示例；声速、回声、超声与次声的细节为配套教学拓展，不称为该条款逐项列出的要求。</p><small>来源：${standard.title}，教育部制定。表 1：原书第 8 页（PDF 第 15 页）；声学：原书第 16–17 页（PDF 第 23–24 页）。页面链接使用 PDF 页序。</small></div><div class="map-list">${modules.map(m=>`<section class="map-module"><div class="map-title">${icon(m.icon)}<h2>${m.name}</h2><a href="#${m.id}">${m.ready ? '开始学习' : '查看目录'} →</a></div><div class="topic-grid">${topicMarkup(m)}</div></section>`).join('')}</div>`;
}
function renderNotFound() { main.innerHTML = '<div class="empty-state"><h1>没有找到这个学习页面</h1><a class="button" href="#acoustics">返回声学首页</a></div>'; }

function route() {
  cleanup(); cleanup = () => {};
  const [rawPage, id, focus] = location.hash.slice(1).split('/');
  const page = rawPage || 'acoustics';
  const active = modules.some(x=>x.id === page) ? page : ['lesson','lab','practice','experiments'].includes(page) ? 'acoustics' : '';
  moduleNav.querySelectorAll('[data-module]').forEach(node => { if (node.dataset.module === active) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current'); });
  const label = modules.find(x=>x.id === active)?.name || '课标与知识地图';
  document.querySelector('#breadcrumb').textContent = `物理 / ${label}${page === 'lab' ? ' / 3D 实验室' : page === 'lesson' ? ' / 知识讲解' : ''}`;
  document.title = `${label} · 物理实验室`;
  if (!page || page === 'acoustics') renderOverview();
  else if (page === 'experiments') renderExperiments();
  else if (page === 'lab') renderLab(id, Number(focus || 0));
  else if (page === 'lesson') renderLesson(id);
  else if (page === 'practice') renderPractice();
  else if (page === 'curriculum') renderCurriculum();
  else renderModule(page);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', () => { route(); main.focus({ preventScroll: true }); });
window.addEventListener('pagehide', () => cleanup());
window.addEventListener('pageshow', event => { if (event.persisted) route(); });
route();
if (!storageAvailable) toast('未能读取本机学习进度。可以继续学习，保存失败时会提示。');
