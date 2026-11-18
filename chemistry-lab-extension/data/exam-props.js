// These are ordinary labelled objects on the bench. Their role is explained only after use.
const prop=(id,type,label,targets,point,extra={})=>({id,type,label,targets,point,...extra});
const acidProps=()=>[
 prop('wetPhPaper','paper','pH试纸（已润湿）',['beaker'],'测pH应使用干燥试纸，润湿会改变样品浓度。',{wet:true}),
 prop('unlabelled','bottle','无标签试剂瓶',['beaker','dropper'],'使用试剂前确认标签，不能把无色当作同一种物质。')
];
export const EXAM_PROPS={
 purify:[
  prop('spareCylinder','cylinder','量筒',['heater'],'量筒用于量取体积，不能当作加热容器。',{emptyVessel:true}),
  prop('testPaper','paper','pH试纸',['funnel'],'pH试纸测酸碱性，不能代替过滤用的滤纸。',{paperKind:'ph'})
 ],
 oxygen:[
  prop('limestone','bottle','石灰石',['flask'],'石灰石不是本次过氧化氢制氧气所用的二氧化锰。',{solidContents:true}),
  prop('spareLimewater','beaker','澄清石灰水',['collector'],'澄清石灰水不能代替带火星木条提供本实验的氧气检验证据。',{initialFill:.45})
 ],
 carbon:[
  prop('sulfuric','bottle','稀硫酸',['flask'],'碳酸钙表面可能形成硫酸钙覆盖层，影响持续制气。'),
  prop('glowingSplint','splint','带火星木条',['collector'],'木条不复燃不能单独证明气体一定是二氧化碳。',{glowing:true})
 ],
 solution:[
  prop('roughBeaker','beaker','粗刻度烧杯',['beaker'],'烧杯刻度只能估读，本次配制应可靠量取水的体积。',{initialFill:.55}),
  prop('wetWeighPaper','paper','潮湿称量纸',['balance'],'潮湿称量纸的质量可能变化，影响称量结果。',{wet:true})
 ],
 metals:[
  prop('coatedCopper','metalpiece','表面覆漆铜片',['sandpaper','tester','tube0','tube1','tube2'],'表面绝缘或接触不良不能证明金属不导电。',{metal:'Cu',coated:true,color:0x40575b}),
  prop('alkaliReagent','bottle','稀氢氧化钠溶液',['tube0','tube1','tube2'],'比较这三种金属与稀酸的反应，不能随意换成另一类试剂。')
 ],
 'acid-base':acidProps(),
 water:[prop('acSupply','battery','交流电源',['left','right'],'水组成探究应使用直流电源，固定电极极性。')],
 combustion:[
  prop('carbonDioxide','gasbottle','二氧化碳气瓶',['chamber'],'改变氧气条件可影响燃烧；不能把所有气体都当作助燃物。'),
  prop('glassPlate','glassplate','玻璃片',['chamber'],'有氧和高温并不意味着任何材料都能作为燃料燃烧。')
 ],
 air:[
  prop('charcoal','wood','木炭',['copperTube'],'燃烧生成气体会影响体积差，不能直接套用铜耗氧的方法。',{color:0x343d3b}),
  prop('smallCopper','bottle','铜粉·0.02 g',['copperTube'],'耗氧剂用量不足，可能导致测得的氧气含量偏低。',{solidContents:true,color:0xb77552})
 ],
 rust:[
  prop('brine','bottle','食盐水',['tube0','tube1','tube2'],'盐不是铁生锈的必要条件；比较水和氧气作用时，其他条件应保持一致。'),
  prop('cooledWater','bottle','煮沸后敞口放凉的水',['tube0','tube1','tube2'],'敞口冷却可能重新溶入氧气，不能直接当作缺氧水。')
 ],
 neutralization:acidProps(),
 conservation:[
  prop('rigidStopper','stopper','硬质瓶塞',['flask'],'不能把产气反应用硬塞封死在刚性容器内。'),
  prop('cottonPlug','cotton','棉花塞',['flask'],'棉花塞可透气，不能当作保留气体的密闭装置。')
 ]
};
export function examPropsFor(labId){return(EXAM_PROPS[labId]||[]).map(({targets,point,...p})=>({...p,present:true,x:0,y:0,z:0,examPoint:point}));}
export function examPropSpec(labId,id){return EXAM_PROPS[labId]?.find(p=>p.id===id);}
