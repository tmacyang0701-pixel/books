// Check observable prerequisites, not the currently displayed guide-step number.
export function combinationIssue(w, source, target) {
 const {items,config:c,data:d}=w.s,p=items[source],q=items[target];
 if(!p||!q||source===target)return '请选择两个不同的器材。';
 if(!w.canCombine(source,target))return `${p.label}不能用于${q.label}，请重新选择目标器材。`;
 if(w.kind==='filter'){
  if(source==='wash'&&['paper','funnel'].includes(target)&&(!c.paper||items.paper.parent!=='funnel'))return '请先把滤纸放入漏斗，再用清水润湿贴合。';
  if(source==='rod'&&target==='funnel'&&items.funnel.parent!=='stand')return '请先把漏斗固定到铁架台，再放置引流玻璃棒。';
  if(source==='receiver'&&target==='funnel'&&items.funnel.parent!=='stand')return '请先固定漏斗，再把接收烧杯放到漏斗下方。';
  if(source==='feed'&&target==='funnel'){
   if(items.funnel.parent!=='stand'||items.receiver.parent!=='stand')return '请先固定漏斗，并在漏斗下方放稳接收烧杯，再倾倒粗盐溶液。';
   if(!c.paper||!items.paper.present||items.paper.parent!=='funnel')return '请先在漏斗中装好滤纸，不能用 pH 试纸代替滤纸。';
   if(!c.wetPaper)return '滤纸还没有润湿，请先用洗瓶润湿，使滤纸贴合漏斗。';
   if(!c.guide||!items.rod.present||items.rod.parent!=='funnel')return '请先把玻璃棒放在漏斗一侧用于引流，再倾倒溶液。';
   if(d.feed<=0)return '粗盐溶液已经用完，可重置实验重新取样。';
  }
  if(source==='receiver'&&target==='dish'&&d.filtrate<=0)return '请先过滤得到滤液，再将接收烧杯中的滤液转移到蒸发皿。';
 }
 if(w.kind==='solution'){
  if(source==='salt'&&target==='balance'&&(items.paper.parent!=='balance'||!d.tared))return '请先在天平上放好称量纸并去皮，再称取氯化钠。';
  if(source==='paper'&&target==='beaker'&&!d.weighedSalt)return '请先完成称量，再把称量纸上的氯化钠转移到烧杯。';
  if(source==='cylinder'&&target==='beaker'){
   if(p.remaining===0)return '量筒已经倒空，请重新量取并读数后再转移。';
   if(!d.read)return '请先平视读取量筒液面，再将水转移到烧杯。';
  }
 }
 if(w.kind==='acid'&&source==='dropper'&&target==='beaker'&&!w.s.assembly.dropperLiquid)return '请先用滴管取液，再向烧杯滴加。';
 return '';
}
