import {examPropSpec} from '../data/exam-props.js';
function explain(w,id,source,target,message,{fatal=false,severity='info'}={}){const spec=examPropSpec(w.s.id,id),entry={at:w.s.elapsed,source,target,point:spec?.point||message,message,outcome:fatal?'failed':'observation'};w.s.examEvents.push(entry);if(w.s.examEvents.length>30)w.s.examEvents.shift();w.engine.log('操作辨析',message);if(fatal)return w.fail(message,spec?.point||'重新辨认器材用途后再试。');w.engine.feedback('exam-prop-'+id,severity,message,spec?.point||'','根据实际现象和目标，再选择合适器材。');return true;}
function park(w,id){const p=w.s.items[id];if(p?.parent){w.unmount(id);Object.assign(p,p.home);}}
export function examCanCombine(w,source,target){const spec=examPropSpec(w.s.id,source);return spec?spec.targets.includes(target):undefined;}
export function useExamProp(w,source,target){const s=w.s,d=w.d,c=w.c,e=w.engine,p=s.items[source],q=s.items[target];
 // Replacement with the appropriate object clears a pending choice, not a latched failure.
 if(w.kind==='filter'&&source==='paper'&&target==='funnel'){park(w,'testPaper');delete s.assembly.badFilter;}
 if(w.kind==='filter'&&source==='dish'&&target==='heater'){park(w,'spareCylinder');delete s.assembly.unsuitableHeat;}
 if(w.kind==='solution'&&source==='paper'&&target==='balance'){park(w,'wetWeighPaper');delete s.assembly.wetWeighPaper;d.tared=false;}
 if(w.kind==='solution'&&source==='salt'&&target==='balance'&&s.assembly.wetWeighPaper&&s.items.wetWeighPaper.parent==='balance')return explain(w,'wetWeighPaper',source,target,'使用潮湿称量纸称盐，不能保证称量结果可靠。',{fatal:true});
 if(w.kind==='gas'&&s.id==='carbon'&&source==='reagent'&&target==='flask'&&d.reagent>0&&c.acid==='sulfuric')return explain(w,'sulfuric',source,target,'已有另一种酸，不能直接混加后当作同一条件比较。',{fatal:true});
 if(w.kind==='mass'&&source==='balloon'&&target==='flask'){park(w,'rigidStopper');park(w,'cottonPlug');c.rigidSeal=false;}
 if(source==='sandpaper'&&target==='coatedCopper'){q.polished=true;q.coated=false;q.color=0xb77552;q.label='铜片（已打磨）';return explain(w,'coatedCopper',source,target,'已打磨表面，减少覆层和接触不良的影响。');}
 const spec=examPropSpec(s.id,source);if(!spec)return undefined;if(!spec.targets.includes(target))return w.reject('这两个器材没有组合；请调整放置位置或更换目标。');
 switch(source){
  case 'spareCylinder':if(d.heater)return explain(w,source,source,target,'热源开启时不能放置量筒。',{fatal:true});park(w,'dish');w.mount(source,target,{y:.33});s.assembly.unsuitableHeat=source;return explain(w,source,source,target,'量筒已放到热源处；它用于量取体积，不适合作为加热容器。',{severity:'warning'});
  case 'testPaper':park(w,'paper');w.mount(source,target,{x:-.2,y:.9});c.paper=false;c.wetPaper=false;s.assembly.badFilter=source;return explain(w,source,source,target,'放入的是pH试纸，不能把它当作过滤用的滤纸。',{severity:'warning'});
  case 'limestone':return explain(w,source,source,target,'本次是过氧化氢制氧气，石灰石不能作为所选的二氧化锰使用，未执行混合。',{fatal:true});
  case 'spareLimewater':if(d.collected<1)return w.reject('先制取并收集气体，再取样比较。');d.limewaterOxygenComparison=true;return explain(w,source,source,target,'石灰水未见明显浑浊；这不能代替木条复燃，也不能据此确认气体就是氧气。');
  case 'sulfuric':if(d.reagent>0&&c.acid!=='sulfuric')return explain(w,source,source,target,'已有稀盐酸，不能混加另一种酸后继续作同条件比较。',{fatal:true});c.acid='sulfuric';w.action('add-liquid');return explain(w,source,source,target,'已用稀硫酸与石灰石比较，继续观察固体表面覆盖和制气速率。');
  case 'glowingSplint':if(d.collected<1)return w.reject('气体样品尚不足，请先收集。');d.glowingCO2Comparison=true;p.extinguished=true;return explain(w,source,source,target,'没有观察到木条复燃；不复燃不能单独证明气体是二氧化碳，仍需石灰水检验证据。');
  case 'roughBeaker':return explain(w,source,source,target,'用粗刻度烧杯估读后配液，缺少本次配制所需的可靠量取证据，未按估读值配制。',{fatal:true});
  case 'wetWeighPaper':park(w,'paper');w.mount(source,target,{y:.4});s.assembly.wetWeighPaper=true;c.paper=true;d.tared=false;return explain(w,source,source,target,'称量纸处于潮湿状态，去皮不能保证后续质量保持不变。',{severity:'warning'});
  case 'coatedCopper':if(target==='sandpaper'){p.polished=true;p.coated=false;p.color=0xb77552;p.label='铜片（已打磨）';return explain(w,source,source,target,'铜片表面已打磨，可重新检查导电接触。');}if(target==='tester'){if(p.coated&&!p.polished){d.lamp=false;return explain(w,source,source,target,'灯泡未亮，先检查表面覆层和接触；不能因此断言铜不导电。',{severity:'warning'});}d.lamp=true;s.evidence.physical=true;return explain(w,source,source,target,'接触改善后灯泡亮起，获得金属导电性证据。');}if(target.startsWith('tube')){const i=Number(target.at(-1)),m=d.samples[i];if(m.introduced)return w.reject('试管中已有金属，请先清洗再更换。');c.sample=i;m.metal='Cu';m.polished=p.polished;w.mount(source,target,{y:.5});w.action('metal');return explain(w,source,source,target,'已放入铜片；比较反应时还需注意表面状态。');}break;
  case 'alkaliReagent':return explain(w,source,source,target,'本次比较三种金属与稀酸的反应，换用碱液会改变探究问题，未执行混合。',{fatal:true});
  case 'wetPhPaper':c.paperWet=true;return explain(w,source,source,target,'试纸已被润湿，测量证据不可靠，未把读数记为有效结果。',{fatal:true});
  case 'unlabelled':return explain(w,source,source,target,'未确认无标签试剂的身份，不能按稀酸或稀碱使用，未执行混合。',{fatal:true});
  case 'acSupply':return explain(w,source,source,target,'水组成探究需要固定极性的直流电源；交流电源不适用本次装置，模型未通电。',{fatal:true});
  case 'carbonDioxide':c.oxygen=0;d.oxygen=0;d.burning=false;return explain(w,source,source,target,'观察室改为二氧化碳条件，燃烧不能继续；这组比较改变了氧气条件。');
  case 'glassPlate':c.material='stone';d.fuel=1;w.mount(source,target,{y:.2});d.burning=false;return explain(w,source,source,target,'换成不可燃玻璃片；即使有氧和高温，也不能把它当作木片燃烧。');
  case 'charcoal':return explain(w,source,source,target,'木炭燃烧还会生成气体，不能直接套用铜耗氧的体积差估算，模型未替换反应物。',{fatal:true});
  case 'smallCopper':if(s.assembly.copperLoaded)return w.reject('比较用量时，请重新取样，保持初始空气条件一致。');c.copperMass=.02;s.assembly.copperLoaded=true;return explain(w,source,source,target,'已加入0.02 g铜粉；观察反应后是否仍有氧气，注意用量不足的影响。');
  case 'brine':case 'cooledWater':{const i=Number(target.at(-1)),m=d.samples[i];c.sample=i;m.water=true;m.oxygen=true;m.oil=false;if(source==='brine')m.saltwater=true;return explain(w,source,source,target,source==='brine'?'加入食盐水，同时引入盐条件；比较水和氧气作用时，请保持各组盐条件一致。':'敞口放凉的水可能重新溶氧，本模型将它按有氧水处理，不能作为缺氧对照。');}
  case 'rigidStopper':case 'cottonPlug':if(source==='rigidStopper'&&d.reacted)return explain(w,source,source,target,'产气反应已经开始，不能改用硬塞封死装置。',{fatal:true});park(w,'balloon');park(w,source==='rigidStopper'?'cottonPlug':'rigidStopper');w.mount(source,target,{y:1.67});c.balloon=false;c.rigidSeal=source==='rigidStopper';return explain(w,source,source,target,source==='rigidStopper'?'硬塞会封死刚性容器，不能用这种状态开始产气反应。':'棉花塞可以透气，不能当作把气体保留在称量系统内的密闭装置。',{severity:'warning'});
 }
 return undefined;
}
export function afterExamCombine(w,source,target){if(w.kind==='burn'&&['sample','stone','glassPlate'].includes(source)&&target==='chamber')for(const id of ['sample','stone','glassPlate'])if(id!==source&&w.s.items[id]){park(w,id);w.s.items[id].consumed=false;}}
export function examBeforeAction(w,action){if(w.kind==='filter'&&action==='heat-toggle'&&!w.d.heater&&w.s.assembly.unsuitableHeat&&w.s.items.spareCylinder.present&&w.s.items.spareCylinder.parent==='heater')return explain(w,'spareCylinder','heater','spareCylinder','量筒不能作为加热容器，热源未开启。',{fatal:true});if(w.kind==='filter'&&action==='pour'&&w.s.assembly.badFilter&&w.s.items.testPaper.present&&w.s.items.testPaper.parent==='funnel')return explain(w,'testPaper','feed','funnel','漏斗内是pH试纸，不能用它代替滤纸完成本次过滤。',{fatal:true});return undefined;}
export function examConnection(w,a,b){const ids=[a,b].map(v=>v.split(':')[0]);if(ids.includes('acSupply'))return useExamProp(w,'acSupply',ids.find(v=>v!=='acSupply'));return undefined;}

export function examPlacementChanged(w,id){if(id==='rigidStopper'&&(!w.s.items[id].present||!w.s.items[id].parent))w.c.rigidSeal=false;if(id==='spareCylinder'&&w.s.items[id].parent!=='heater')delete w.s.assembly.unsuitableHeat;if(id==='testPaper'&&w.s.items[id].parent!=='funnel')delete w.s.assembly.badFilter;if(id==='wetWeighPaper'&&(!w.s.items[id].present||w.s.items[id].parent!=='balance')){delete w.s.assembly.wetWeighPaper;w.c.paper=false;w.d.tared=false;}}
