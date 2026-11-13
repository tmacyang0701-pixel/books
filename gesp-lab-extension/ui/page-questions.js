import {escapeHtml as esc} from './core.js';
import {lessonProse,repairProseMath} from './lesson-prose.js';

const clean = value => typeof value==='string' ? repairProseMath(value).replace(/\s+/g,' ').trim() : '';
const unique = values => [...new Set(values.map(clean).filter(Boolean))];

function fallbackQuestions(page, lesson) {
  const title=clean(page.title),kind=clean(page.kind);
  const lines=Array.isArray(page.content)?page.content.filter(v=>typeof v==='string'):[];
  const text=title+' '+lines.join(' ');
  const goldbach=lesson.problem?.id==='gesp-2026-09-5-1'||/哥德巴赫/.test(lesson.problem?.title||'');
  if(goldbach){
    if(/样例/.test(title))return ['10 的哪些拆分能被计数？','为什么 5 + 5 只算一种？','最小输入 4，应该怎样检查？'];
    if(kind==='复杂度'||/复杂度/.test(title))return ['筛法与枚举，谁决定总复杂度？','为什么枚举 n/2 次仍记作 O(n)？','素数表用多少空间，换来了什么？'];
    if(kind==='易错'||/易错|边界/.test(title))return ['把 a ≤ n/2 写成 a < n/2 会漏什么？','把 1 当作质数会多算哪一对？','只测 n=4，能发现哪些边界错误？'];
    if(kind==='总结')return ['我能按顺序说出筛法和计数的作用吗？','怎样说明每一对质数恰好被数一次？','如果要回答多个 n，哪些结果能复用？'];
    if(kind==='代码'||page.code?.trim())return ['素数标记为什么需要 n+1 个位置？','代码中哪一步排除了 0 和 1？','计数循环为什么必须包含 n/2？'];
    if(kind==='步骤'||/演示|执行步骤/.test(title)){
      const n=title.match(/n\s*[=＝]\s*(\d+)/i)?.[1]||'本例';
      return [`${n==='本例'?'本例':`n=${n} 时`}，第一个候选配对是什么？`,'遇到一个合数时，计数为什么不变？','最后一对两个加数相等，应该怎样处理？'];
    }
    if(/筛|埃氏|埃拉/.test(title))return ['划去一个质数的倍数，依据是什么？','为什么筛倍数可以从 p×p 开始？','为什么筛到 √n 就足够了？'];
    if(kind==='思路'||/枚举|去重/.test(title))return ['为什么只枚举到 n/2？','只知道 a，怎样确定另一个加数？','当 a=b 时，这一对应该算几次？'];
    return ['题目统计的是方案数，还是质数个数？','3 + 7 与 7 + 3 为什么算同一种？','一对数相加等于 n，就一定能计数吗？'];
  }

  const focus=clean(title.replace(/^(?:核心知识|知识点|解题思路|题目描述|详细步骤|课程总结)[：:]\s*/,''))||'当前步骤';
  if(page.lab&&(kind==='语法'||kind==='动手实践'))return [`「${focus}」中，每个符号分别表示什么？`,'先预测本页实验的输出，再运行对照？',`完成「${clean(page.lab.title)||focus}」需要补写哪一步？`];
  const anchor=(lines.find(v=>clean(v).length>5)||focus).replace(/^\s*\d+[.、．]\s*/,'').replace(/[。；;].*$/,'').slice(0,38);
  if(kind==='复杂度'||/复杂度/.test(title))return [`「${focus}」中，执行次数最多的是哪一步？`,'输入规模翻倍，主要操作次数会怎样变化？','本页哪些数据结构需要额外空间？'];
  if(kind==='易错'||/易错|边界/.test(title))return [`「${anchor}」能用哪个最小样例检查？`,'输入落在范围端点时，这一页哪里容易出错？','怎样修改一个样例，让本页的错误暴露出来？'];
  if(kind==='总结')return [`我能用自己的话说明「${anchor}」吗？`,`「${focus}」的方法依赖哪些前提？`,'从本页总结中，选一个结论举例验证？'];
  if(kind==='代码'||page.code?.trim())return [`「${focus}」先初始化哪些状态？`,'本页循环何时结束，边界能取到吗？','选本页的一个输入，逐步跟踪关键变量？'];
  const topics=[
    [/二分/,['二分时，答案为什么还在当前区间？','判断成立后，哪一半可以舍弃？','区间只剩一个元素时，怎么处理？']],
    [/最大公约数|辗转相除|gcd/i,['为什么取余后，公约数不会改变？','余数变成 0 时，答案是哪一个数？','用本页的两个数，手算一轮取余？']],
    [/质因数|因数分解/,['试除成功后，为什么还要再除同一因子？','什么时候可以停止继续试除？','最后剩下大于 1 的数，应该怎样处理？']],
    [/贪心/,['本页为什么优先选这个候选？','换一种局部选择，会怎样影响后续？','能否用一个小例子检查这个选择规则？']],
    [/动态规划|背包|\bdp\b/i,['本页状态表示的子问题是什么？','计算这个状态，需要哪些已知状态？','初始状态和转移顺序应该怎样确定？']],
    [/递归/,['这一次递归把问题缩小成了什么？','最小问题应该直接返回什么？','返回上一层时，还需要完成哪一步？']],
    [/排序/,['本页比较两个元素时，依据是什么？','两个元素相等时，顺序会影响结果吗？','用三个元素手动模拟本页的排序步骤？']],
    [/筛法|素数筛/,['划去倍数为什么能筛出质数？','开始划去倍数的位置有什么依据？','哪些数需要在筛选前单独处理？']],
  ];
  // A title names this page's focus more reliably than incidental words in its body.
  const match=topics.find(([pattern])=>pattern.test(title))||topics.find(([pattern])=>pattern.test(text));
  if(match)return match[1];
  if(/样例|演示/.test(title)||kind==='步骤')return [`「${anchor}」执行前，已知哪些数值？`,'按本页第一步操作，哪个变量先改变？','对照本页表格，下一行应该怎样得到？'];
  return [`怎样用自己的话理解「${focus}」？`,`「${anchor}」用了什么已知条件？`,`给「${focus}」举一个最小例子？`];
}

export function pageQuestions(page={},lesson={}) {
  const authored=Array.isArray(page.questions)?unique(page.questions.filter(q=>typeof q==='string'&&clean(q).length>=4&&clean(q).length<=80)):[];
  return unique([...authored,...fallbackQuestions(page,lesson)]).slice(0,3);
}

export function questionsHtml(page,lesson) {
  return pageQuestions(page,lesson).map(question=>`<button type="button" title="${esc(question)}" aria-label="${esc(question)}" data-chat-question="${esc('请引导我思考：'+question+' 先给一个小提示或小问题，让我试着回答，再根据我的回答继续。')}">${lessonProse(question)}</button>`).join('');
}
