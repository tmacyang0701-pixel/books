const commonNames={ans:'结果',answer:'结果',result:'结果',cnt:'计数',count:'计数',sum:'总和',tmp:'临时值',temp:'临时值'};
const drinkNames={ans:'目标浓度原料体积',sum_pos:'高糖偏差总量',sum_pos_dev:'高糖偏差总量',sum_neg:'低糖偏差总量',sum_neg_dev:'低糖偏差总量',
  high:'高糖原料',High:'高糖原料',low:'低糖原料',Low:'低糖原料',perfect:'目标浓度原料',n:'原料种类数',t:'目标含糖量',v:'当前体积',s:'当前含糖量',d:'含糖量差',
  target:'剩余待配平量',target_dev:'剩余待配平量',cap:'当前可配平量',can_provide:'当前可配平量',need_v:'需要的体积',added_vol:'混合部分体积',Total:'总体积'};
const primeNames={isPrime:'质数标记',is_prime:'质数标记',answer:'方案数',ans:'方案数',n:'目标偶数',N:'目标偶数',p:'当前质数',x:'当前倍数',a:'较小加数',b:'另一个加数'};

function readableNames(text,lesson) {
  const names={...commonNames};
  if(lesson.problem?.id==='gesp-2026-09-5-2'||lesson.problem?.title==='饮品调制')Object.assign(names,drinkNames);
  if(lesson.problem?.id==='gesp-2026-09-5-1'||lesson.problem?.title==='哥德巴赫猜想')Object.assign(names,primeNames);
  // Rename whole identifiers only; preserve quoted input/output text and unknown names.
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_][A-Za-z_0-9]*/g,token=>Object.hasOwn(names,token)?names[token]:token);
}

export function pagePseudocode(page,lesson={}) {
  if(!page?.code?.trim())return null;
  if(typeof page.pseudocode==='string'&&page.pseudocode.trim())return {code:readableNames(page.pseudocode,lesson),example:readableNames(typeof page.pseudocodeExample==='string'?page.pseudocodeExample:'',lesson)};
  if(lesson.problem?.id==='gesp-2026-09-5-1'||/哥德巴赫/.test(lesson.problem?.title||''))return {
    code:`读入目标偶数

// ① 筛出不超过目标偶数的素数
将 质数标记[0…目标偶数] 全部设为 真
将 质数标记[0]、质数标记[1] 设为 假
当前质数从 2 开始，直到 当前质数 × 当前质数 > 目标偶数：
    如果 质数标记[当前质数] 为 真：
        从 当前质数 × 当前质数 开始，依次划去不超过目标偶数的倍数
        把这些倍数对应的质数标记设为 假

// ② 只枚举较小的加数，避免交换顺序重复计数
方案数 ← 0
较小加数从 2 遍历到 目标偶数的一半（包含端点）：
    另一个加数 ← 目标偶数 − 较小加数
    如果 质数标记[较小加数] 和 质数标记[另一个加数] 都为 真：
        方案数 ← 方案数 + 1

输出方案数`,
    example:'目标偶数为 10：2 + 8 不计，3 + 7 计一次，4 + 6 不计，5 + 5 再计一次，最后输出 2。'
  };
  return null;
}
