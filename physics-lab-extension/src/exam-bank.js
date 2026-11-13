// 上海中考选编：保留所列题目的条件和数值，改述题干；解析为本项目编写。
// 公开整理版并非考试院授权原卷，逐题链接可核对年份、题号与原文。
import { modules, lessons } from './curriculum.js';
import { additionalSources, buildAdditionalQuestions } from './exam-extra.js';
export const examSources = {
  ...additionalSources,
  2021: { label: '2021 年上海中考物理 · 公开整理版', url: 'https://www.gcyls.cn/file/upload/202402/29/151733151.pdf' },
  2022: { label: '2022 年上海中考物理 · 回忆整理版', url: 'https://m.5068.com/zhongkao/a693512.html' },
  2023: { label: '2023 年上海中考物理 · 公开整理版', url: 'https://kaosj.com/papers/2023/07/2023-zhongkao-paper-shanghai-c7c3954218-paper/' },
  2024: { label: '2024 年上海中考物理 · 公开整理版', url: 'https://kaosj.com/papers/2024/07/2024-zhongkao-paper-shanghai-afa46ab769-paper/' },
};
const choice = (label, options, answer) => ({ kind: 'choice', label, options, answer });
const number = (label, answer, unit) => ({ kind: 'number', label, answer, unit });
const word = (label, answer) => ({ kind: 'text', label, answer });
const question = (year, number, module, lesson, title, type, stem, parts, steps, pitfall, extra = {}) => ({
  id: `sh-${year}-${number}`, year, number, module, lesson, title, type, stem, parts, steps, pitfall,
  edition: '真题改述', needsReview: ['计算题', '实验探究题'].includes(type), ...extra,
});

const originalQuestions = [
  question(2024, '12', 'acoustics', 'pitch', '用实验数据解释音调', '实验探究题',
    '敲击同种铁棍，改变有效长度 L，得到下表。根据数据解释长度对音调的影响；若要发出低于 500 Hz 的 re 音，长度应怎样选？',
    [choice('所需长度与 10 cm 的关系', ['大于', '等于', '小于'], 0)],
    ['比较各组数据：L 从 5 cm 增至 25 cm，频率从 700 Hz 降至 200 Hz。', '频率决定音调。因此，在该实验条件下，铁棍越长，音调越低。', '10 cm 对应 500 Hz。要获得更低的频率，应选比 10 cm 更长的铁棍。'],
    '不能用响度解释音调，也不能仅凭这五组数据断言频率与长度成反比。',
    { table: { headers: ['L / cm', '5', '10', '15', '20', '25'], rows: [['f / Hz', '700', '500', '400', '300', '200']] }, reasoning: '请引用表中数据，写出“长度—频率—音调”的推理。' }),
  question(2024, '3', 'optics', 'refraction', '斜射入水的折射角', '选择题',
    '光由空气斜射入水，入射角为 60°。以下哪个角度符合折射角的范围？',
    [choice('折射角', ['0°', '40°', '60°', '90°'], 1)],
    ['两个角都相对于法线测量。', '从空气斜射入水，折射光线偏向法线，折射角大于 0°、小于 60°。', '四个候选值中，只有 40° 符合。这里是范围判断，不是在计算水的折射率。'],
    '不要把光线与水面的夹角当作入射角或折射角。'),
  question(2024, '10', 'mechanics', 'buoyancy', '称重法测浮力', '填空题',
    '测力计悬挂物体，在空气中读数 3.0 N，完全浸入水中后读数 2.0 N。保持物体悬空，再向更深处移动。',
    [number('物体所受浮力', 1, 'N'), word('浮力方向', ['竖直向上']), choice('浸没后继续下移，测力计读数', ['变大', '不变', '变小'], 1)],
    ['悬挂静止时 G = F拉 + F浮，故 F浮 = 3.0 − 2.0 = 1.0 N。', '浮力方向竖直向上。', '完全浸没后，排水体积不再增加；水的密度不变，浮力不变，测力计读数仍为 2.0 N。'],
    '在液体密度不变、物体体积不变的条件下，浸没后的浮力不随深度增大。'),
  question(2024, '16', 'mechanics', 'lever', '杠杆平衡求动力', '计算题',
    '杠杆平衡，阻力为 90 N，阻力臂为 0.2 m，动力臂为 0.6 m。计算动力。',
    [number('动力 F₁', 30, 'N')],
    ['先把动力、阻力与各自力臂对应：F₁ × 0.6 = 90 × 0.2。', 'F₁ = 90 × 0.2 ÷ 0.6 = 30 N。', '动力臂是阻力臂的 3 倍，动力为阻力的三分之一，与省力杠杆的特点一致。'],
    '力臂是支点到力的作用线的垂直距离，不一定等于杆长。'),
  question(2024, '19', 'electricity', 'electric-power', '由最小功率反推电路', '计算题',
    '15 V 恒压电源先只接 10 Ω 的 R₁。再接入滑动变阻器 R₂ 和量程 0～0.6 A 的电流表，电路最小总功率为 27 W。求初始电流，判断两电阻的连接方式，并求 R₂ 最大阻值和安全范围内的最大总功率。',
    [number('只接 R₁ 时的电流', 1.5, 'A'), choice('R₁ 与 R₂ 的连接方式', ['串联', '并联'], 1), number('R₂ 的最大阻值', 50, 'Ω'), number('最大总功率', 31.5, 'W')],
    ['只接 R₁ 时：I₁ = 15 / 10 = 1.5 A，P₁ = 15² / 10 = 22.5 W。', '若串联，总电阻增大，总功率将小于 22.5 W；而题给最小功率已达 27 W，所以只能并联。', 'R₂ 功率最小时为 27 − 22.5 = 4.5 W，R₂最大 = 15² / 4.5 = 50 Ω。', 'R₁ 的电流已超过 0.6 A，故该电流表只能测 R₂ 支路。I₂最大 = 0.6 A，P总最大 = 22.5 + 15 × 0.6 = 31.5 W。'],
    '27 W 是整个电路的功率；0.6 A 不是干路电流上限。',
    { reasoning: '写出为什么排除串联，以及电流表应接在哪一条支路。', note: '原图连接条件已改用文字说明；不含原试卷插图。' }),

  question(2023, '2', 'acoustics', 'loudness', '音量旋钮改变了什么', '选择题',
    '把收音机的音量调大，主要改变声音的哪一项特性？',
    [choice('声音特性', ['音调', '响度', '音色', '频率'], 1)],
    ['音量调节对应听起来强弱的变化。', '强弱用响度描述；音调描述高低，音色用于辨别声源。'],
    '日常所说的“声音大”，通常是响度大，不是频率高。'),
  question(2023, '3', 'thermal', 'heat-engine', '热机何时输出机械能', '选择题',
    '汽油机四个冲程中，哪一个把燃气的内能转化为对外输出的机械能？',
    [choice('冲程', ['吸气', '压缩', '做功', '排气'], 2)],
    ['做功冲程中，高温高压燃气膨胀并推动活塞。', '燃气内能减小，活塞获得机械能；压缩冲程中的主要转化方向相反。'],
    '“活塞在运动”不代表每个冲程都在由燃气对外提供动力。'),
  question(2023, '9', 'electricity', 'ohm', '电荷量、电功与电阻', '填空题',
    '某导体在 3 V 电压下，10 s 内通过横截面的电荷量为 5 C。保持温度等条件不变，再把电压改为 6 V。',
    [number('原先的电流', 0.5, 'A'), number('原先 10 s 内的电功', 15, 'J'), number('电压改为 6 V 后的电阻', 6, 'Ω')],
    ['I = q / t = 5 / 10 = 0.5 A。', 'W = UIt = 3 × 0.5 × 10 = 15 J，也可用 W = Uq。', 'R = U / I = 3 / 0.5 = 6 Ω。材料、长度、横截面积和温度不变时，改变电压不改变这个电阻值。'],
    '升压后电流也改变，不能用新电压除以旧电流求电阻。'),
  question(2023, '16', 'thermal', 'specific-heat', '水降温放热', '计算题',
    '5 kg 水由 40 ℃ 冷却到 20 ℃。取水的比热容为 4.2×10³ J/(kg·℃)，求放出的热量。',
    [number('放出的热量', 420000, 'J')],
    ['放热时采用降温量：Δt = 40 − 20 = 20 ℃。', 'Q放 = cmΔt = 4.2×10³ × 5 × 20 = 4.2×10⁵ J。', '题目问放出热量的大小，所以结果写正值。'],
    '热量计算使用温度变化量，不直接代入初温或末温。'),
  question(2023, '17', 'mechanics', 'work-power', '水平推力的功与功率', '计算题',
    '物体重 20 N，受 10 N 的水平推力，5 s 内匀速前进 4 m。计算这段时间推力的功与功率。',
    [number('推力做功', 40, 'J'), number('推力的功率', 8, 'W')],
    ['位移沿推力方向，W = Fs = 10 × 4 = 40 J。', 'P = W / t = 40 / 5 = 8 W。', '重力方向竖直，与水平位移垂直，不能用 20 N 代替推力。'],
    '题目给了重力，并不意味着计算推力做功时一定需要它。'),

  question(2022, '3', 'acoustics', 'loudness', '公共场所的声音控制', '选择题',
    '公共场所要求轻声交谈，主要是在限制声音的哪种特性？',
    [choice('限制的声音特性', ['响度', '音调', '音色', '频率'], 0)],
    ['轻声与大声描述声音的强弱。', '减小发声的振幅通常会使响度减小，并不要求改变音色或音调。'],
    '控制响度与阻止声音传播是不同的描述角度。'),
  question(2022, '4', 'energy', 'energy-conservation', '落水发电的能量链', '选择题',
    '高处的水落下并驱动发电装置，主要的能量转化依次是什么？',
    [choice('能量转化顺序', ['动能 → 重力势能 → 电能', '重力势能 → 动能 → 电能', '电能 → 重力势能 → 动能', '重力势能 → 电能 → 动能'], 1)],
    ['水在高处具有重力势能，下落时转化为动能。', '水流带动装置运动，发电机把机械能转化为电能。', '实际装置还会产生内能等，这不影响题目所问的主要转化顺序。'],
    '能量转化要按照过程先后排列，电能并非无中生有。'),
  question(2022, '5', 'optics', 'lens-image', '由像距判断新像', '选择题',
    '光屏距凸透镜 25 cm 时接到放大的像。将物体移到离透镜 30 cm 处，此时形成哪种像？',
    [choice('新像的性质', ['放大的虚像', '正立的虚像', '放大的实像', '缩小的实像'], 3)],
    ['能被光屏接到的是实像。放大实像的像距大于二倍焦距，所以 25 cm > 2f。', '新的物距为 30 cm，比 25 cm 更大，必有 30 cm > 2f。', '物距大于二倍焦距时，形成倒立、缩小的实像。'],
    '不要把题目给出的 25 cm 像距误当成焦距。'),
  question(2022, '7-3', 'magnetism', 'electromagnet', '奥斯特实验说明什么', '填空题',
    '奥斯特研究通电导线对小磁针的作用。这个实验说明电流周围存在什么？',
    [word('电流周围存在', ['磁场'])],
    ['通电后小磁针偏转，表明它受到磁场作用。', '这个实验把电与磁联系起来，说明电流具有磁效应。'],
    '这是电流产生磁场，不是电磁感应发电。', { number: '7（第 3 空）', note: '节选原题第 3 空，其余小问未收录。' }),
  question(2022, '16', 'mechanics', 'buoyancy', '用排水体积求浮力', '计算题',
    '物体排开水 5×10⁻³ m³。取水的密度 1.0×10³ kg/m³，g = 9.8 N/kg，计算浮力。',
    [number('浮力', 49, 'N')],
    ['阿基米德原理：F浮 = ρ水gV排。', 'F浮 = 1.0×10³ × 9.8 × 5×10⁻³ = 49 N。', '已知排水体积，不必先判断物体是否完全浸没。'],
    '公式里是排开液体的体积；未浸没时不能直接使用物体总体积。'),

  question(2021, '4', 'optics', 'lens-image', '凸透镜的成像区域', '选择题',
    '透镜焦距为 10 cm，蜡烛位于透镜前 35 cm。判断像的大小与虚实。',
    [choice('像的性质', ['放大实像', '放大虚像', '等大实像', '缩小实像'], 3)],
    ['先求二倍焦距：2f = 20 cm。', '35 cm > 20 cm，物体位于二倍焦距以外。', '此时像倒立、缩小，为实像，位于透镜另一侧的一倍焦距与二倍焦距之间。'],
    '用物距与焦距的关系判断，不能只凭“凸透镜能放大”作答。'),
  question(2021, '8', 'acoustics', 'timbre', '区分声音的三个特性', '填空题',
    '听两位女高音演唱：女高音的“高”、听起来的强弱差别、辨认不同歌手，分别对应哪种声音特性？',
    [word('女高音的“高”', ['音调']), word('听起来的强弱', ['响度']), word('辨认歌手的依据', ['音色'])],
    ['女高音描述声音的高低，对应音调，与振动频率有关。', '听起来的强弱对应响度，还受到距离等因素影响。', '声源特征不同造成音色差异，因此能辨认歌手。'],
    '“高声说话”通常说响度；“女高音”说音调，要结合语境。'),
  question(2021, '10', 'mechanics', 'gravity', '重力与浮力分别计算', '填空题',
    '物体质量为 2 kg，进入水中后排开 1×10⁻³ m³ 的水。取 g = 9.8 N/kg，水的密度为 1.0×10³ kg/m³。',
    [number('重力大小', 19.6, 'N'), word('重力方向', ['竖直向下']), number('浮力大小', 9.8, 'N')],
    ['G = mg = 2 × 9.8 = 19.6 N，方向竖直向下。', 'F浮 = ρ水gV排 = 1.0×10³ × 9.8 × 1×10⁻³ = 9.8 N。', '重力由物体质量决定，浮力由排开液体的重力决定，应分开计算。'],
    '质量的单位是 kg，重力的单位是 N；不能写“重力为 2 kg”。'),
  question(2021, '11', 'electricity', 'electric-energy', '电荷量与电功', '填空题',
    '某导体两端电压为 8 V，10 s 内通过的电荷量为 5 C。求电流、电功，并判断只改变电压时导体电阻的变化（温度等条件不变）。',
    [number('电流', 0.5, 'A'), number('这段时间内的电功', 40, 'J'), choice('电阻的变化', ['变大', '不变', '变小'], 1)],
    ['I = q / t = 5 / 10 = 0.5 A。', 'W = Uq = 8 × 5 = 40 J。', '温度等条件不变，电阻不随外加电压改变。'],
    'R = U/I 是求值关系，不表示电阻总是随电压成正比。'),
  question(2021, '14', 'thermal', 'specific-heat', '水升温吸热', '计算题',
    '使 2 kg 水升温 5 ℃，水的比热容取 4.2×10³ J/(kg·℃)。求吸收的热量。',
    [number('吸收的热量', 42000, 'J')],
    ['升温 5 ℃ 表示温度变化量为 5 ℃。', 'Q吸 = cmΔt = 4.2×10³ × 2 × 5 = 4.2×10⁴ J。'],
    '“升高 5 ℃”与“升高到 5 ℃”含义不同，后者还需要初温。'),
];

// 章节对应本应用的课程目录；综合题同时标注各小问涉及的章节。
const originalTopics = {
  'sh-2024-12': ['pitch', '音调|频率|实验数据分析'],
  'sh-2024-3': ['refraction', '光的折射|折射角与入射角'],
  'sh-2024-10': ['buoyancy|equilibrium', '称重法测浮力|阿基米德原理|二力平衡'],
  'sh-2024-16': ['lever', '杠杆平衡条件|力臂'],
  'sh-2024-19': ['electric-power|ohm|series-parallel', '电功率|欧姆定律|并联电路|电路安全范围'],
  'sh-2023-2': ['loudness', '响度|声音特性'],
  'sh-2023-3': ['heat-engine', '做功冲程|内能转化'],
  'sh-2023-9': ['ohm|current|electric-energy|resistance', '电流定义|电功|欧姆定律|电阻的影响因素'],
  'sh-2023-16': ['specific-heat', '比热容|放热计算|温度变化量'],
  'sh-2023-17': ['work-power', '功|功率|力与位移方向'],
  'sh-2022-3': ['loudness', '响度|振幅'],
  'sh-2022-4': ['energy-conservation|mechanical-energy|induction', '能量转化|重力势能|动能|发电'],
  'sh-2022-5': ['lens-image', '凸透镜成像|像距与焦距'],
  'sh-2022-7-3': ['electromagnet', '奥斯特实验|电流磁效应'],
  'sh-2022-16': ['buoyancy', '阿基米德原理|排开液体的体积'],
  'sh-2021-4': ['lens-image', '凸透镜成像|二倍焦距'],
  'sh-2021-8': ['timbre|pitch|loudness', '音色|音调|响度'],
  'sh-2021-10': ['gravity|buoyancy', '重力计算|重力方向|阿基米德原理'],
  'sh-2021-11': ['electric-energy|current|resistance', '电流定义|电功|电阻的影响因素'],
  'sh-2021-14': ['specific-heat', '比热容|吸热计算|温度变化量'],
};
export const examQuestions = [
  ...originalQuestions.map(q => ({ ...q, lessonIds: originalTopics[q.id][0].split('|'), knowledgePoints: originalTopics[q.id][1].split('|') })),
  ...buildAdditionalQuestions({ question, choice, number, word }),
].map(q => ({ ...q, moduleIds: [...new Set(q.lessonIds.map(id => lessons.find(l => l.id === id).module))] }))
  .sort((a, b) => b.year - a.year || parseInt(a.number, 10) - parseInt(b.number, 10));
export const examYears = [...new Set(examQuestions.map(q => q.year))].sort((a, b) => b - a);
export const examYearRange = `${examYears.at(-1)}—${examYears[0]}`;
export const examChapters = lessons.filter(l => examQuestions.some(q => q.lessonIds.includes(l.id)));
export function filterExamQuestions({ year = '', module = '', lesson = '', type = '', search = '' } = {}) {
  const term = search.trim().toLowerCase();
  return examQuestions.filter(q => (!year || String(q.year) === String(year)) && (!module || q.moduleIds.includes(module))
    && (!lesson || q.lessonIds.includes(lesson)) && (!type || q.type === type)
    && [q.year, q.number, q.title, q.stem, ...q.knowledgePoints,
      ...q.lessonIds.map(id => lessons.find(l => l.id === id).subtitle),
      ...q.moduleIds.map(id => modules.find(m => m.id === id).name)].join(' ').toLowerCase().includes(term));
}
export function parseExamNumber(value) {
  const text = String(value).normalize('NFKC').replace(/\s/g, '').replace(/−/g, '-');
  if (!text) return NaN;
  const scientific = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))[×xX*]10\^([+-]?\d+)$/);
  if (scientific) return Number(scientific[1]) * 10 ** Number(scientific[2]);
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : NaN;
}
export function gradeExamPart(part, value) {
  if (value === undefined || String(value).trim() === '') return false;
  if (part.kind === 'choice') return String(value) === String(part.answer);
  if (part.kind === 'number') {
    const n = parseExamNumber(value);
    return Number.isFinite(n) && Math.abs(n - part.answer) <= Math.max(1, Math.abs(part.answer)) * 1e-8;
  }
  return part.answer.includes(String(value).normalize('NFKC').replace(/\s|[。.!！]/g, ''));
}
export function examOutcome(question, record) {
  if (!record?.submitted) return 'unanswered';
  if (!question.parts.every((p, i) => gradeExamPart(p, record.values?.[i]))) return 'review';
  if (question.needsReview && record.review !== true) return 'review';
  return 'correct';
}
export function restoreExamAnswers(saved) { return restoreQuestionAnswers(examQuestions, saved); }
export function restoreQuestionAnswers(questions, saved) {
  const result = {};
  for (const q of questions) {
    const record = saved?.[q.id];
    if (!record || typeof record !== 'object') continue;
    result[q.id] = { values: q.parts.map((_, i) => typeof record.values?.[i] === 'string' ? record.values[i].slice(0,200) : ''),
      reasoning: typeof record.reasoning === 'string' ? record.reasoning.slice(0,3000) : '', submitted: record.submitted === true, review: record.review === true };
  }
  return result;
}
