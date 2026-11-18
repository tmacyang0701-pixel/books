import {ChemistryEngine} from './engine.js';
import {combinationIssue} from './combination-rules.js';
import {examPropsFor} from '../data/exam-props.js';
import {examCanCombine,useExamProp,afterExamCombine,examBeforeAction,examConnection,examPlacementChanged} from './exam-props.js';
const item=(id,type,label,extra={})=>({id,type,label,present:true,x:0,y:0,z:0,...extra});
const part=(id,label,type='bottle',extra={})=>item(id,type,label,extra);
const disposableFailures=new Set(['dirty-filtrate','misaligned','dry-heating','no-stir','hot-apparatus-moved','rod-displaced','contaminate-stock','wet-ph-paper','pressure','chloride','rigid-seal','not-tared','meniscus','uncontrolled','old-reagent','test-live','jar-direction','co2-water-loss','air-leak','hot-reading','no-seal-test','empty-heating','dish-off-heater','missing-apparatus','wrong-connection']);
export class Workbench{
 constructor(engine){this.engine=engine;this.executing=false;this.moving=false;this.reset();}
 get s(){return this.engine.state;}get c(){return this.s.config;}get d(){return this.s.data;}get kind(){return this.engine.lab.kind;}
 reset(){const e=this.engine,s=e.state;this.executing=false;this.moving=false;s.failure=null;s.assembly={};s.examEvents=[];s.pour=null;this.pourSequence=0;let extra=[];
  if(this.kind==='filter')extra=[part('paper','滤纸','paper',{paperKind:'filter'}),part('wash','洗瓶·清水'),part('stand','铁架台','stand')];
  if(this.kind==='gas')extra=[part('stopper','橡胶塞','stopper'),part('hose','导气管','hose')];
  if(this.kind==='solution')extra=[part('paper','称量纸','paper')];
  if(this.kind==='metals')extra=[...['Mg','Fe','Cu'].map(m=>part('metal'+m,{Mg:'镁条',Fe:'铁片',Cu:'铜片'}[m],'metalpiece',{metal:m})),part('sandpaper','砂纸','paper'),part('copperSolution','硫酸铜溶液'),part('wash','洗瓶·清水')];
  if(this.kind==='acid')extra=[part('phPaper','干燥pH试纸','paper'),part('wash','洗瓶·清水')];
  if(this.kind==='electrolysis')extra=[part('electrolyte','非氯化物助导电液'),part('saltwater','氯化钠溶液'),part('wirePlus','红导线','hose'),part('wireMinus','黑导线','hose')];
  if(this.kind==='burn')extra=[part('stone','石块','metalpiece',{stone:true}),part('lid','观察室盖','lid')];
  if(this.kind==='air')extra=[part('copper','铜粉','bottle'),part('hose0','导管A','hose'),part('hose1','导管B','hose')];
  if(this.kind==='rust')extra=[part('water','清水'),part('dry','干燥条件试剂'),part('deoxygenated','除去氧气的水'),part('oil','油封液'),...Array.from({length:3},(_,i)=>part('nail'+i,'铁钉'+['A','B','C'][i],'metalpiece',{metal:'Fe'}))];
  extra.push(...examPropsFor(s.id));for(const p of extra)s.items[p.id]=p;
  const height={stand:2.8,electrode:2.2,testtube:2.2,cylinder:2.15,jar:2.1,rod:2,flask:1.8,bottle:1.5,gasbottle:1.8,beaker:1.4,funnel:1.3,reactiontube:1.2,battery:1,tester:.7,basin:.7,dish:.7,balance:.45,heater:.35,metalpiece:.15,wood:.2,paper:.08,hose:.08,stopper:.15,cotton:.2,lid:.08,glassplate:.08};const layout=Object.values(s.items).sort((a,b)=>(height[b.type]||.3)-(height[a.type]||.3));const rows=Math.ceil(layout.length/5);layout.forEach((p,i)=>{p.x=-3.6+(i%5)*1.8;p.z=-1.6+Math.floor(i/5)*(rows>1?3.2/(rows-1):0);p.y=p.type==='dish'?.05:p.type==='funnel'?.4:0;p.parent=null;p.offset=null;p.assembled=false;p.consumed=false;p.polished=false;p.liquidLevel=.65;p.solidContents=Boolean(p.solidContents||['solid','salt','copper','dry'].includes(p.id));p.home={x:p.x,y:p.y,z:p.z};});
  if(this.kind==='filter')Object.assign(this.c,{paper:false,wetPaper:false,guide:false,stir:false});
  if(this.kind==='gas'){Object.assign(this.c,{stopper:false,inverted:false});s.items.reagent.label=s.id==='oxygen'?'3%过氧化氢溶液':'稀盐酸';s.items.solid.label=s.id==='oxygen'?'二氧化锰':'石灰石';}if(this.kind==='metals')s.items.reagent.label='稀盐酸';
  if(this.kind==='solution')this.c.paper=false;
  if(this.kind==='electrolysis')this.c.electrolyte='pure';
  if(this.kind==='burn'){this.c.covered=false;s.items.sample.present=true;}
  if(this.kind==='air')this.c.sealed=false;
  if(this.kind==='rust')for(const m of this.d.samples)Object.assign(m,{water:false,oxygen:true,oil:false});
  if(this.kind==='mass'){this.c.balloon=false;s.items.flask.y=0;}
 }
 fail(message,correction='重置本次实验，重新搭建并按规范操作。'){if(this.s.failure)return false;this.s.failure={message,correction,at:this.s.elapsed};this.d.heater=false;this.d.power=false;this.engine.log('实验失败',message);this.s.alerts.push({code:'trial-failed',severity:'danger',message,consequence:'本次实验已失败，后续反应停止。',correction,at:this.s.elapsed});this.engine.emit();return false;}
 feedback(code,severity,message,correction){if(code==='rod-displaced'&&!this.d.heater)return;if(disposableFailures.has(code)&&severity!=='success'&&severity!=='info')this.fail(message,correction);}
 active(){if(!this.s.failure)return true;this.engine.info('本次实验已失败，请查看失败原因并重置后再试。');return false;}
 mount(id,target,offset={x:0,y:0,z:0}){const p=this.s.items[id],q=this.s.items[target];if(!p||!q)return false;const old={x:p.x,y:p.y||0,z:p.z};p.parent=target;p.offset={...offset};p.assembled=true;p.x=q.x+(offset.x||0);p.y=(q.y||0)+(offset.y||0);p.z=q.z+(offset.z||0);this.s.assembly[id]=target;const delta={x:p.x-old.x,y:p.y-old.y,z:p.z-old.z};const follow=key=>{for(const child of Object.values(this.s.items).filter(i=>i.parent===key)){child.x+=delta.x;child.y=(child.y||0)+delta.y;child.z+=delta.z;follow(child.id);}};follow(id);return true;}
 unmount(id){const p=this.s.items[id];if(p){p.parent=null;p.offset=null;p.assembled=false;if(p.home)p.y=p.home.y;delete this.s.assembly[id];}}
 move(id,x,z){if(!this.s.items[id])return false;const p=this.s.items[id],dx=x-p.x,dz=z-p.z;if(Math.hypot(dx,dz)<1e-5)return true;const old={x:p.x,z:p.z};this.unmount(id);examPlacementChanged(this,id);this.moving=true;this.engine.move(id,x,z);this.moving=false;
  const delta={x:p.x-old.x,z:p.z-old.z};const follow=parent=>{for(const child of Object.values(this.s.items).filter(v=>v.parent===parent)){child.x+=delta.x;child.z+=delta.z;follow(child.id);}};follow(id);
  if(this.kind==='filter'){if(id==='paper'){this.c.paper=false;this.c.wetPaper=false;}if(id==='funnel')this.c.guide=false;}
  if(this.kind==='solution'&&id==='paper')this.c.paper=false;
  if(this.kind==='gas'&&id==='stopper'){this.c.stopper=false;this.d.sealChecked=false;}
  if(this.kind==='mass'&&id==='balloon')this.c.balloon=false;
  if(['air','burn'].includes(this.kind)&&this.d.heater&&['heater','copperTube','chamber','sample'].includes(id))this.fail('加热中移动了热源或受热器材。','先关闭热源并待冷却，再调整器材。');
  this.engine.emit();return true;
 }
 presenceChanged(id){const p=this.s.items[id];examPlacementChanged(this,id);if(p.present)return;if(this.d.heater&&(id==='heater'||p.parent==='heater'))this.fail('加热中移出了热源或受热器材。','先关闭热源并待冷却后再调整。');if(this.kind==='filter'&&id==='paper'){this.c.paper=false;this.c.wetPaper=false;}if(this.kind==='gas'&&id==='stopper'){this.c.stopper=false;this.d.sealChecked=false;if(this.d.gasGenerated>0)this.fail('反应中取下瓶塞，气体无法按原路线收集。');}if(p.type==='hose'){this.s.connections=[];this.d.sealChecked=false;if(this.d.gasGenerated>0||this.d.power||this.d.heater)this.fail('实验进行中拆除了导管或导线。');this.afterConnect();}if(this.kind==='mass'&&id==='balloon')this.c.balloon=false;}
 examConnection(a,b){return examConnection(this,a,b);}
 beforeAction(action){if(!this.active())return false;const decision=examBeforeAction(this,action);if(decision!==undefined)return decision;if(this.kind==='filter'&&['pour','transfer'].includes(action)){const issue=this.combinationIssue(...(action==='pour'?['feed','funnel']:['receiver','dish']));if(issue)return this.reject(issue);}
  if(this.kind==='filter'&&action==='transfer'&&this.d.filtrate<=0)return this.fail('接收烧杯中没有可转移的滤液。');
  if(this.kind==='electrolysis'&&action==='power-toggle'&&!this.d.power&&['left','right'].some(id=>this.s.items[id].parent!=='basin'))return this.fail('集气管尚未正确放入电解液槽。');if(this.kind==='rust'&&action==='prepare'){const m=this.d.samples[this.c.sample];if(m.water&&!m.oxygen&&!m.oil)return this.fail('除氧后的水没有油封，缺氧条件无法保持。');}if(this.kind==='air'&&action==='heat-toggle'&&!this.d.heater&&!this.s.assembly.copperLoaded)return this.fail('反应管中尚未加入铜粉。');
  if(['air','burn'].includes(this.kind)&&action==='heat-toggle'&&!this.d.heater){const vessel=this.kind==='air'?'copperTube':'chamber';if(!this.engine.has('heater')||!this.engine.has(vessel)||this.s.items[vessel].parent!=='heater')return this.fail('受热器材没有放稳在热源上。','先组合受热器材与热源，再开启。');}
  return true;
 }
 action(id){if(!this.beforeAction(id))return false;this.executing=true;const r=this.engine.dispatch(id);this.executing=false;return r;}
 reject(message){this.engine.feedback('placement-hint','warning',message,'本次组合未执行，物质数量没有改变。','按提示完成准备后重试；也可以重置实验。',{repeat:true});return false;}
 combinationIssue(source,target){return combinationIssue(this,source,target);}
 canCombine(a,b){if(a===b||!this.engine.has(a)||!this.engine.has(b)||this.s.failure)return false;const p=this.s.items[a],q=this.s.items[b],kind=this.kind,exam=examCanCombine(this,a,b);if(exam!==undefined)return exam;
 const pairs={filter:{paper:['funnel'],wash:['paper','funnel'],funnel:['stand'],receiver:['stand','funnel','dish'],rod:['funnel','dish'],dish:['heater'],feed:['funnel']},gas:{stopper:['flask'],collector:['basin',...(this.s.items.limewater?['limewater']:[])],reagent:['flask'],solid:['flask'],splint:['collector']},solution:{paper:['balance','beaker'],salt:['balance'],cylinder:['beaker'],rod:['beaker']},acid:{acid:['dropper','beaker'],base:['dropper','beaker'],dropper:['beaker'],indicator:['beaker'],probe:['beaker','acid','base','indicator'],phPaper:['beaker','acid','base','indicator'],wash:['phPaper','probe']},electrolysis:{electrolyte:['basin'],saltwater:['basin'],left:['basin'],right:['basin']},burn:{sample:['chamber'],stone:['chamber'],chamber:['heater'],lid:['chamber']},air:{copper:['copperTube'],copperTube:['heater']},mass:{flask:['balance'],balloon:['flask'],acid:['flask'],solid:['flask']}};
 if(pairs[kind]?.[a]?.includes(b))return true;if(p.type==='hose')return this.engine.lab.links.flat().some(port=>port.split(':')[0]===b);
 if(kind==='metals')return (p.type==='metalpiece'&&(b==='sandpaper'||b==='tester'||b.startsWith('tube')))||(a==='sandpaper'&&q.type==='metalpiece')||(['reagent','copperSolution','wash'].includes(a)&&b.startsWith('tube'));
 if(kind==='rust')return ['water','dry','deoxygenated','oil','nail0','nail1','nail2'].includes(a)&&b.startsWith('tube');return false;
 }
 combine(source,target){if(!this.active())return false;const issue=this.combinationIssue(source,target);if(issue)return this.reject(issue);const e=this.engine,s=this.s,c=this.c,d=this.d,p=s.items[source],q=s.items[target],before={data:structuredClone(this.d),fromFill:this.visualFill(source),toFill:this.visualFill(this.kind==='filter'&&source==='feed'?'receiver':target)};let handled=true;const exam=useExamProp(this,source,target);
  if(exam!==undefined){if(!exam)return false;}else if(this.kind==='filter'){
   if(source==='paper'&&target==='funnel'){this.mount(source,target,{y:0});c.paper=true;}
   else if(source==='wash'&&target==='paper'){if(p.id==='wash'&&q.parent==='funnel')c.wetPaper=true;else return this.reject('请先把滤纸放入漏斗，再润湿贴合。');}
   else if(source==='wash'&&target==='funnel'){if(!c.paper)return this.reject('请先把滤纸放入漏斗，再润湿贴合。');c.wetPaper=true;}
   else if(source==='funnel'&&target==='stand')this.mount(source,target,{y:1.4});
   else if(source==='receiver'&&(target==='stand'||target==='funnel')){const stand=target==='stand'?target:q.parent;if(stand!=='stand')return this.fail('漏斗尚未固定，不能在悬空漏斗下接液。');this.mount(source,'stand');}
   else if(source==='rod'&&target==='funnel'){if(q.parent!=='stand')return this.reject('先把漏斗固定到铁架台，再放置玻璃棒。');c.stir=false;c.guide=true;e.positionFilterRod();this.mount(source,target,{x:-.48,y:.87});}
   else if(source==='rod'&&target==='dish'){c.guide=false;c.stir=true;e.positionFilterRod();this.mount(source,target,{x:.18,y:.3});}
   else if(source==='dish'&&target==='heater'){if(d.heater)return this.fail('热源开启时放置或移动蒸发皿。','先关热源，冷却后搭建。');this.mount(source,target,{y:.37});}
   else if(source==='feed'&&target==='funnel'){if(!this.beforeAction('pour'))return false;if(!e.has('paper')||s.items.paper.parent!=='funnel'||!e.has('rod')||s.items.rod.parent!=='funnel'||!c.paper||!c.wetPaper||!c.guide)return this.fail(!c.paper?'没有滤纸，泥沙会进入接收烧杯。':!c.wetPaper?'滤纸未润湿贴合，过滤操作不规范。':'未放置玻璃棒引流，液体可能飞溅。','装好并润湿滤纸，把玻璃棒靠在滤纸一侧后再缓慢倾倒。');this.action('pour');}
   else if(source==='receiver'&&target==='dish')this.action('transfer');
   else handled=false;
  }else if(this.kind==='gas'){
   if(source==='stopper'&&target==='flask'){this.mount(source,target,{y:1.67});c.stopper=true;}
   else if(source==='collector'&&target==='basin'){this.mount(source,target);c.collection='water';c.inverted=true;}
   else if(source==='reagent'&&target==='flask')this.action('add-liquid');
   else if(source==='solid'&&target==='flask')this.action('add-solid');
   else if(source==='splint'&&target==='collector')this.action(s.id==='oxygen'?'test-gas':'test-full');
   else if(source==='collector'&&target==='limewater')this.action('test-gas');
   else handled=false;
  }else if(this.kind==='solution'){
   if(source==='paper'&&target==='balance'){this.mount(source,target,{y:.4});c.paper=true;}
   else if(source==='salt'&&target==='balance'){if(!d.tared||s.items.paper.parent!=='balance')return this.fail('称量纸未放好并去皮，称盐结果不可靠。');d.weighedSalt=c.saltMass;e.info(`天平上已称取 ${d.weighedSalt} g 氯化钠，需转移到烧杯。`);}
   else if(source==='paper'&&target==='beaker'){if(!d.weighedSalt)return this.fail('天平上没有称好的氯化钠。');d.salt+=d.weighedSalt;d.weighedSalt=0;d.dissolved=false;c.paper=false;this.unmount('paper');Object.assign(p,p.home);}
   else if(source==='cylinder'&&target==='beaker'){if(p.remaining===0)return this.reject('量筒已空，请重新量取并读数后再转移。');if(!d.read)return this.fail('尚未平视读取量筒液面。');this.action('add-water');}
   else if(source==='rod'&&target==='beaker'){this.mount(source,target,{x:.1,y:.15});this.action('stir');}
   else handled=false;
  }else if(this.kind==='acid'){
   if(['acid','base'].includes(source)&&target==='dropper'){s.assembly.dropperLiquid=source;e.info('滴管已取少量'+p.label+'，拖到反应烧杯滴加。');}
   else if(source==='dropper'&&target==='beaker'){const liquid=s.assembly.dropperLiquid;if(!liquid)return this.fail('滴管中还没有取液。');this.action(liquid==='acid'?'add-acid':'add-base');}
   else if(['acid','base'].includes(source)&&target==='beaker')this.action(source==='acid'?'add-acid':'add-base');
   else if(source==='indicator'&&target==='beaker')this.action('indicator');
   else if(['probe','phPaper'].includes(source)&&target==='beaker')this.action('measure');
   else if(['probe','phPaper'].includes(source)&&['acid','base','indicator'].includes(target))this.action('dip-bottle');
   else if(source==='wash'&&['probe','phPaper'].includes(target)){c.paperWet=true;return this.fail('pH试纸被水润湿，本次读数不可靠。');}
   else handled=false;
  }else if(this.kind==='electrolysis'){
   if(source==='electrolyte'&&target==='basin')c.electrolyte='sulfate';
   else if(source==='saltwater'&&target==='basin'){c.electrolyte='chloride';return this.fail('含氯电解液不适用于本次水组成探究。');}
   else if(['left','right'].includes(source)&&target==='basin')this.mount(source,target,{x:source==='left'?-.75:.75});
   else handled=false;
  }else if(this.kind==='metals'){
   if(source==='sandpaper'&&p.id&&q.type==='metalpiece'){q.polished=true;e.info(q.label+'表面已打磨。');}
   else if(p.type==='metalpiece'&&target==='sandpaper'){p.polished=true;e.info(p.label+'表面已打磨。');}
   else if(p.type==='metalpiece'&&target.startsWith('tube')){const i=Number(target.at(-1)),m=d.samples[i];if(m.introduced)return this.fail('试管中已有金属，不能直接换金属。');c.sample=i;m.metal=p.metal;m.polished=p.polished;this.mount(source,target,{y:.5});this.action('metal');}
   else if(['reagent','copperSolution'].includes(source)&&target.startsWith('tube')){c.sample=Number(target.at(-1));const m=d.samples[c.sample],reagent=source==='reagent'?'hcl':'copper';if(m.volume&&m.reagent!==reagent)return this.fail('旧试剂没有清洗就加入另一试剂。');m.reagent=reagent;this.action('dose');}
   else if(p.type==='metalpiece'&&target==='tester'){c.sample=Math.max(0,['Mg','Fe','Cu'].indexOf(p.metal));d.samples[c.sample].polished=p.polished;this.action('conductivity');}
   else if(source==='wash'&&target.startsWith('tube')){c.sample=Number(target.at(-1));this.action('wash');for(const child of Object.values(s.items).filter(i=>i.parent===target)){this.unmount(child.id);child.x=-3.6;child.z=1.4;child.y=0;}}
   else handled=false;
  }else if(this.kind==='burn'){
   if(['sample','stone'].includes(source)&&target==='chamber'){c.material=source==='stone'?'stone':'wood';d.fuel=1;this.mount(source,target,{y:.2});s.items[source==='stone'?'sample':'stone'].consumed=true;p.consumed=false;}
   else if(source==='chamber'&&target==='heater')this.mount(source,target,{y:.32});
   else if(source==='lid'&&target==='chamber'){this.mount(source,target,{y:2.15});c.covered=true;}
   else handled=false;
  }else if(this.kind==='air'){
   if(source==='copper'&&target==='copperTube'){s.assembly.copperLoaded=true;e.info('反应管中已加入铜粉。');}
   else if(source==='copperTube'&&target==='heater')this.mount(source,target,{y:.2});
   else handled=false;
  }else if(this.kind==='rust'){
   if(target.startsWith('tube')){const i=Number(target.at(-1)),m=d.samples[i];c.sample=i;
    if(source==='water'){m.water=true;m.oxygen=true;}
    else if(source==='dry'){m.water=false;m.oxygen=true;}
    else if(source==='deoxygenated'){m.water=true;m.oxygen=false;}
    else if(source==='oil')m.oil=true;
    else if(source.startsWith('nail')){this.mount(source,target,{y:.5});this.action('prepare');}
    else handled=false;
   }else handled=false;
  }else if(this.kind==='mass'){
   if(source==='flask'&&target==='balance')this.mount(source,target,{y:.4});
   else if(source==='balloon'&&target==='flask'){this.mount(source,target,{y:1.7});c.balloon=true;}
   else if(['acid','solid'].includes(source)&&target==='flask'){s.assembly[source+'Added']=true;if(s.assembly.acidAdded&&s.assembly.solidAdded){if(s.items.flask.parent!=='balance')return this.fail('反应瓶未放到称量系统中，无法完成本次质量对照。');this.action('react');}}
   else handled=false;
  }
  if(!handled&&p.type==='hose'){if(!s.assembly[source+'End']){s.assembly[source+'End']=target;e.info('已选导管第一端，再将同一导管拖到另一器材。');}else{const a=s.assembly[source+'End'],valid=e.lab.links.find(([x,y])=>[a,target].includes(x.split(':')[0])&&[a,target].includes(y.split(':')[0]));if(!valid)return this.fail('这两个器材不能这样接管。');e.connect(...valid);p.consumed=true;p.parent=a;}handled=true;}
  if(!handled)return this.reject('这两个器材没有组合；请将当前器材用于高亮目标。');
  afterExamCombine(this,source,target);this.recordPour(source,target,before);if(!p.parent&&['bottle','beaker','cylinder','dropper'].includes(p.type)&&p.home)Object.assign(p,p.home);e.log('组合',p.label+' → '+q.label);e.emit();return !s.failure;
 }
 visualFill(id,data=this.d){const p=this.s.items[id];if(!p)return 0;if(p.type==='bottle')return p.solidContents?0:(p.liquidLevel??.65);if(this.kind==='filter')return id==='feed'?data.feed/70:id==='receiver'?data.filtrate/60:id==='dish'?data.dish/45:0;if(this.kind==='gas'&&id==='flask')return Math.min(.85,data.reagent/35);if(this.kind==='solution')return id==='cylinder'?(p.remaining??this.c.waterVolume)/65:id==='beaker'?data.water/60:0;if(this.kind==='acid'&&id==='beaker')return Math.min(.85,(data.acid+data.base+(data.indicator?.2:0))/45);if(this.kind==='metals'&&id.startsWith('tube'))return data.samples[Number(id.at(-1))].volume/22;if(this.kind==='rust'&&id.startsWith('tube'))return data.samples[Number(id.at(-1))].water?.5:0;if(this.kind==='mass'&&id==='flask')return this.s.assembly.acidAdded?.5:.02;return 0;}
 recordPour(source,target,before){const p=this.s.items[source],kind=this.kind,d=this.d,old=before.data;let amount=0,receiver=target;
  if(kind==='filter'){if(source==='feed'&&target==='funnel'){amount=old.feed-d.feed;receiver='receiver';}else if(source==='receiver'&&target==='dish')amount=old.filtrate-d.filtrate;else if(source==='wash'&&['paper','funnel'].includes(target))amount=1;}
  if(kind==='gas'&&['reagent','sulfuric'].includes(source)&&target==='flask')amount=d.reagent-old.reagent;
  if(kind==='solution'&&source==='cylinder'&&target==='beaker'){amount=d.water-old.water;p.remaining=0;}
  if(kind==='acid'&&target==='beaker')amount=d.acid+d.base-old.acid-old.base+(source==='indicator'?.2:0);if(kind==='acid'&&target==='dropper')amount=this.c.dose;
  if(kind==='metals'&&['reagent','copperSolution'].includes(source)&&target.startsWith('tube'))amount=this.c.volume;
  if(kind==='rust'&&['water','deoxygenated','oil','brine','cooledWater'].includes(source)&&target.startsWith('tube'))amount=source==='oil'?2:10;
  if(kind==='mass'&&source==='acid'&&target==='flask')amount=20;if(kind==='electrolysis'&&source==='electrolyte'&&target==='basin')amount=2;
  if(!(amount>0)||this.s.failure)return;if(p.type==='bottle')p.liquidLevel=Math.max(.05,p.liquidLevel-amount/100);
  this.s.pour={id:++this.pourSequence,source,target,receiver,amount,fromStart:before.fromFill,fromEnd:this.visualFill(source),toStart:before.toFill,toEnd:this.visualFill(receiver),color:kind==='filter'&&source==='feed'?'#b19c6b':'#85c5d9',presented:false};
 }
 demoStep(index){if(this.kind==='filter'&&index===0){this.combine('funnel','stand');this.combine('receiver','stand');}if(this.kind==='burn'&&index===0){this.combine('sample','chamber');this.combine('chamber','heater');}if(this.kind==='rust'&&index===0)this.combine('water','tube0');if(this.kind==='mass'&&index===0){this.combine('flask','balance');this.combine('balloon','flask');}}
 demoOperation(op){const e=this.engine,c=this.c,d=this.d,kind=this.kind;
  if(op.type==='link'){if(kind==='electrolysis'){this.combine('left','basin');this.combine('right','basin');}e.connect(op.a,op.b);return true;}
  if(op.type==='set'){
   if(kind==='filter'&&op.value&&['paper','wetPaper','guide','stir'].includes(op.key)){const recipe={paper:['paper','funnel'],wetPaper:['wash','funnel'],guide:['rod','funnel'],stir:['rod','dish']}[op.key];this.combine(...recipe);return true;}
   if(kind==='solution'&&op.key==='paper'&&op.value){this.combine('paper','balance');return true;}
   if(kind==='gas'&&op.key==='collection'&&op.value==='water'){this.combine('collector','basin');return true;}
   if(kind==='electrolysis'&&op.key==='electrolyte'&&op.value==='sulfate'){this.combine('electrolyte','basin');return true;}
   if(kind==='burn'&&op.key==='material'){this.combine(op.value==='stone'?'stone':'sample','chamber');return true;}
   if(kind==='rust'&&op.key!=='sample'){const recipe=op.key==='water'?(op.value?'water':'dry'):op.key==='oxygen'&&!op.value?'deoxygenated':op.key==='oil'&&op.value?'oil':null;if(recipe){this.combine(recipe,'tube'+c.sample);return true;}}
   return false;
  }
  if(op.type!=='act')return false;const id=op.id;
  if(kind==='filter'){if(id==='pour'){this.combine('feed','funnel');return true;}if(id==='transfer'){this.combine('receiver','dish');return true;}if(id==='heat-toggle'&&!d.heater)this.mount('dish','heater',{y:.37});}
  if(kind==='gas'){if(id==='leak-test'&&!c.stopper)this.combine('stopper','flask');if(id==='add-liquid'){this.combine('reagent','flask');return true;}if(id==='add-solid'){this.combine('solid','flask');return true;}}
  if(kind==='solution'){if(id==='weigh'){this.combine('salt','balance');this.combine('paper','beaker');return true;}if(id==='add-water'){this.combine('cylinder','beaker');return true;}if(id==='stir'){this.combine('rod','beaker');return true;}}
  if(kind==='metals'){const tube='tube'+c.sample,metal='metal'+d.samples[c.sample].metal;if(id==='polish'){this.combine(metal,'sandpaper');d.samples[c.sample].polished=true;return true;}if(id==='dose'){this.combine(d.samples[c.sample].reagent==='copper'?'copperSolution':'reagent',tube);return true;}if(id==='metal'){this.combine(metal,tube);return true;}if(id==='conductivity'){this.combine(metal,'tester');return true;}if(id==='wash'){this.combine('wash',tube);return true;}}
  if(kind==='air'&&id==='heat-toggle'&&!d.heater){this.combine('copper','copperTube');this.combine('copperTube','heater');}
  if(kind==='rust'&&id==='prepare'){this.combine('nail'+c.sample,'tube'+c.sample);return true;}
  if(kind==='mass'&&id==='release'){this.operate('release');return true;}if(kind==='mass'&&id==='react'){this.combine('acid','flask');this.combine('solid','flask');return true;}
  return false;
 }
 afterConnect(){const links=this.s.connections;if(this.kind==='gas')this.s.items.hose.consumed=links.length>0;if(this.kind==='electrolysis'){for(const [id,pole]of [['wirePlus','+'],['wireMinus','-']])this.s.items[id].consumed=links.some(l=>l.includes('battery:'+pole));}if(this.kind==='air'){this.s.items.hose0.consumed=links.length>0;this.s.items.hose1.consumed=links.length>1;}if(this.kind==='air')this.c.sealed=this.engine.lab.links.every(l=>this.engine.connected(...l));}
 controls(id){const map={filter:{feed:['pourRate'],heater:['heat']},gas:{reagent:['dose'],solid:['solidDose']},solution:{balance:['saltMass'],cylinder:['waterVolume','eyeAngle']},metals:{reagent:['volume'],copperSolution:['volume']},acid:{acid:['dose'],base:['dose'],dropper:['dose'],indicator:['indicator']},electrolysis:{battery:['voltage']},burn:{heater:['temperature'],oxygen:['oxygen']},air:{copper:['copperMass'],heater:['heat']},rust:{},mass:{}};return map[this.kind]?.[id]||[];}
 actions(id){const map={filter:{heater:['heat-toggle']},gas:{flask:['leak-test'],collector:['turn-collector']},solution:{balance:['tare'],cylinder:['read-water'],beaker:['label']},metals:{},acid:{},electrolysis:{battery:['power-toggle'],left:['test-left'],right:['test-right']},burn:{heater:['heat-toggle']},air:{copperTube:['leak-test'],heater:['heat-toggle'],syringe:['read']},rust:{},mass:{balance:['weigh'],balloon:['release']}};return map[this.kind]?.[id]||[];}
 operate(action){if(action==='release'&&this.kind==='mass'){if(!this.active())return false;this.unmount('balloon');Object.assign(this.s.items.balloon,this.s.items.balloon.home);}if(action==='turn-collector'){if(!this.active())return false;this.c.inverted=!this.c.inverted;this.engine.emit();return true;}return this.action(action);}
}
export function activateWorkbench(engine){engine.workbench=new Workbench(engine);return engine;}

export function createInteractiveEngine(id){return activateWorkbench(new ChemistryEngine(id));}
