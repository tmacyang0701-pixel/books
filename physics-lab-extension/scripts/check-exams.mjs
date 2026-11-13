import assert from 'node:assert/strict';
import { modules, lessons } from '../src/curriculum.js';
import { examQuestions, examYears, examYearRange, examChapters, examSources, filterExamQuestions, parseExamNumber, gradeExamPart, examOutcome, restoreExamAnswers } from '../src/exam-bank.js';

assert.equal(new Set(examQuestions.map(q => q.id)).size, examQuestions.length);
assert.equal(examQuestions.length, 100);
assert.deepEqual(examYears, [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2014]);
assert.equal(examYearRange, '2014—2025');
assert.equal(examSources[2018].numbering, '整理版题号');
for (const q of examQuestions) {
  assert.ok(examSources[q.year]?.url.startsWith('https://'));
  assert.ok(q.number && q.stem && q.title && q.edition === '真题改述');
  assert.ok(lessons.some(l => l.id === q.lesson && l.module === q.module), q.id + ' 课程链接错误');
  assert.ok(q.lessonIds.includes(q.lesson) && q.moduleIds.includes(q.module));
  assert.equal(new Set(q.lessonIds).size, q.lessonIds.length, q.id + ' 重复章节');
  assert.ok(q.knowledgePoints.length && q.knowledgePoints.every(point => typeof point === 'string' && point.trim()), q.id + ' 缺少知识点');
  for (const id of q.lessonIds) {
    const l = lessons.find(l => l.id === id);
    assert.ok(l && q.moduleIds.includes(l.module), q.id + ' 综合题章节映射错误');
    assert.ok(examChapters.some(chapter => chapter.id === id));
    assert.ok(filterExamQuestions({ lesson:id, module:l.module }).includes(q));
  }
  assert.ok(q.steps.length >= 2 && q.pitfall && q.parts.length);
  if (q.table) for (const row of q.table.rows) assert.equal(row.length, q.table.headers.length);
  for (const p of q.parts) {
    assert.ok(['choice', 'number', 'text'].includes(p.kind));
    if (p.kind === 'choice') assert.ok(Number.isInteger(p.answer) && p.options[p.answer]);
    if (p.kind === 'number') assert.ok(Number.isFinite(p.answer) && p.unit);
    if (p.kind === 'text') assert.ok(Array.isArray(p.answer) && p.answer.length);
    assert.equal(gradeExamPart(p, ''), false);
    assert.equal(gradeExamPart(p, 'not an answer'), false);
    assert.equal(gradeExamPart(p, p.kind === 'text' ? p.answer[0] : String(p.answer)), true);
  }
}
for (const m of modules) assert.ok(filterExamQuestions({ module: m.id }).length, m.id + ' 没有题目');
assert.equal(filterExamQuestions({ year: '2024', module: 'acoustics' })[0].id, 'sh-2024-12');
assert.equal(filterExamQuestions({ year: 2023, type: '计算题', search: '功率' })[0].id, 'sh-2023-17');
assert.equal(filterExamQuestions({ year: 2022, search: '不存在的题目' }).length, 0);
assert.equal(filterExamQuestions({ year: 1900 }).length, 0);
assert.equal(filterExamQuestions({ year: 2025 }).length, 9);
assert.deepEqual(filterExamQuestions({ year:2021, lesson:'pitch' }).map(q=>q.id), ['sh-2021-8']);
assert.ok(filterExamQuestions({ module:'mechanics', lesson:'inertia', year:2025 }).some(q=>q.id==='sh-2025-10'));
assert.equal(filterExamQuestions({ module:'optics', lesson:'inertia' }).length, 0);
assert.ok(filterExamQuestions({ search:'阿基米德原理' }).some(q=>q.id==='sh-2021-10'));
assert.ok(filterExamQuestions({ search:lessons.find(l=>l.id==='buoyancy').subtitle }).some(q=>q.id==='sh-2021-10'));
for (const value of ['42000', '4.2e4', '4.2×10^4', '４２０００', ' 42000 ']) assert.equal(parseExamNumber(value), 42000);
for (const value of ['', ' ', '4+2', '0x10', 'Infinity', '42000 J', '4.2e']) assert.ok(Number.isNaN(parseExamNumber(value)));
assert.equal(gradeExamPart({ kind:'text', answer:['竖直向上'] }, '竖直向上。'), true);
assert.equal(gradeExamPart({ kind:'text', answer:['竖直向上'] }, '向上'), false);

// Independently recompute numerical results, including the multi-step parallel circuit.
const expected = {
  'sh-2024-10': [3-2], 'sh-2024-16': [90*.2/.6], 'sh-2024-19': [15/10, 15**2/(27-15**2/10), 15**2/10+15*.6],
  'sh-2023-9': [5/10, 3*5, 3/(5/10)], 'sh-2023-16': [4200*5*(40-20)], 'sh-2023-17': [10*4, 10*4/5],
  'sh-2022-16': [1000*9.8*5e-3], 'sh-2021-10': [2*9.8, 1000*9.8*1e-3],
  'sh-2021-11': [5/10, 8*5], 'sh-2021-14': [4200*2*5],
  'sh-2025-10': [4200*2*50], 'sh-2024-7': [220, .1*2], 'sh-2024-8': [1e4*40, 1e4*40/50],
  'sh-2024-17': [4200*2*50], 'sh-2020-12': [3/10, 6/(3/10)], 'sh-2020-13': [9.8, 9.8-9.8],
  'sh-2020-19': [4200*2*10], 'sh-2020-20': [10*20, 10*20/10],
  'sh-2019-9': [.1*8], 'sh-2019-12': [3/10, 9/(3/10), 9/(3/10)],
  'sh-2019-19': [1000*9.8*1e-3], 'sh-2019-20': [60*.2/.6],
  'sh-2018-12': [3/10, 6*3, 6/(3/10)], 'sh-2018-13': [1000*9.8*5e-4, 10-1000*9.8*5e-4],
  'sh-2018-19': [4200*.2*50], 'sh-2018-20': [20*30, 20*30/10],
  'sh-2017-12': [6/10, 9*6, 9/(6/10)], 'sh-2017-19': [1000*9.8*2e-3], 'sh-2017-20': [50*20, 50*20/10],
  'sh-2016-9': [.5*3], 'sh-2016-12': [3/10, 3*3, 3/(3/10)],
  'sh-2016-13': [5*9.8, 1000*9.8*2e-3], 'sh-2016-20': [30*10, 30*10/5],
};
for (const [id, numbers] of Object.entries(expected)) {
  const parts = examQuestions.find(q => q.id === id).parts.filter(p => p.kind === 'number');
  assert.equal(parts.length, numbers.length);
  parts.forEach((part, i) => assert.ok(gradeExamPart(part, numbers[i]), id));
}
const calc = examQuestions.find(q => q.id === 'sh-2024-16');
assert.equal(examOutcome(calc, { values:['30'], submitted:false, review:true }), 'unanswered');
assert.equal(examOutcome(calc, { values:['30'], submitted:true }), 'review');
assert.equal(examOutcome(calc, { values:['30'], submitted:true, review:true }), 'correct');
assert.equal(examOutcome(calc, { values:['90'], submitted:true, review:true }), 'review');
assert.deepEqual(restoreExamAnswers(null), {});
assert.deepEqual(restoreExamAnswers({ unknown: { values:['1'] } }), {});
const saved = restoreExamAnswers({ [calc.id]: { values:['30'], reasoning:'F₁L₁=F₂L₂', submitted:true, review:true } });
assert.equal(examOutcome(calc, restoreExamAnswers(JSON.parse(JSON.stringify(saved)))[calc.id]), 'correct');
assert.equal(restoreExamAnswers({ [calc.id]: { values: [null], submitted:'true', reasoning:[] } })[calc.id].submitted, false);
console.log(`上海中考题检查通过：${examQuestions.length} 道题，年份/来源/课程对应、筛选、数值核对、解题自评和记录恢复。`);
