import {LAB_BY_ID} from '../data/labs.js';
import {filterHeatContact,filterRodPose} from './filter-geometry.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rnd=v=>Math.round(v*100)/100;
const pair=(a,b)=>[a,b].sort().join('|');
export class ChemistryEngine {
 constructor(id){this.lab=LAB_BY_ID[id];if(!this.lab)throw Error('实验不存在');this.listeners=new Set();this.reset();}
 reset(){this.state={id:this.lab.id,elapsed:0,paused:false,speed:1,config:Object.fromEntries(this.lab.controls.map(c=>[c.key,c.value])),items:Object.fromEntries(this.lab.items.map(i=>[i.id,{...i}])),connections:[],alerts:[],log:[],observations:[],evidence:{},data:{},selected:this.lab.items[0]?.id};
  const d=this.state.data;Object.assign(d,{temperature:25,liquid:0,gasGenerated:0,collected:0,purity:0,through:0,pressure:1,solid:0,reagent:0,sealChecked:false,heater:false});
  if(this.lab.kind==='filter')Object.assign(d,{feed:50,filtrate:0,dish:0,salt:0,dirty:false,dishDirty:false,crystals:0,heatingInterrupted:false});
  if(this.lab.kind==='solution')Object.assign(d,{salt:0,water:0,dissolved:false,tared:false,read:false,labelled:false});
  if(this.lab.kind==='metals')d.samples=['Mg','Fe','Cu'].map(metal=>({metal,reagent:'hcl',volume:0,area:1,polished:false,introduced:false,extent:0,elapsed:0}));
  if(this.lab.kind==='acid')Object.assign(d,{acid:0,base:0,indicator:false,pH:7,reading:null,temperature:25});
  if(this.lab.kind==='electrolysis')Object.assign(d,{power:false,leftGas:0,rightGas:0});
  if(this.lab.kind==='burn')Object.assign(d,{burning:false,oxygen:21,fuel:1});
  if(this.lab.kind==='air')Object.assign(d,{oxygenUsed:0,volume:100,read:null});
  if(this.lab.kind==='rust')Object.assign(d,{hours:0,samples:Array.from({length:3},()=>({water:true,oxygen:true,oil:false,prepared:false,rust:0}))});
  if(this.lab.kind==='mass')Object.assign(d,{reacted:false,extent:0,escaped:0,mass:100,reading:null});
  this.workbench?.reset();this.emit();return this.state;
 }
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 emit(){for(const fn of this.listeners)fn(this.state);}
 getParam(key){const {config:c,data:d}=this.state;if(['metals','rust'].includes(this.lab.kind)&&key!=='sample'&&(this.lab.kind!=='metals'||['metal','reagent','area'].includes(key))&&key in d.samples[Number(c.sample)||0])return d.samples[Number(c.sample)||0][key];return c[key];}
 setParam(key,value){const spec=this.lab.controls.find(c=>c.key===key);if(!spec)return this.feedback('invalid-control','warning','这个实验没有该调节项。','参数没有改变。','使用当前实验的器材与控制。');
  if(spec.type==='range'){value=Number(value);if(!Number.isFinite(value)||value<spec.min||value>spec.max)return this.feedback('range','warning','调节值超出仪器量程。','参数没有改变。',`范围是 ${spec.min}～${spec.max} ${spec.unit}。`);}
  else if(spec.type==='select'){const found=spec.options.find(([v])=>String(v)===String(value));if(!found)return false;value=found[0];}else value=Boolean(value);
  const {config:c,data:d}=this.state;
  if(['stir','guide'].includes(key)&&value&&this.state.items.rod&&!this.has('rod'))return this.feedback('missing-rod','warning','玻璃棒不在台面上。','相关操作没有执行。','先放回玻璃棒。');
  if(key==='rigidSeal'&&value&&d.reacted)return this.feedback('rigid-seal','danger','产气反应进行中不能改用封死的硬塞。','本次更换未执行。','保留可膨胀气球或合理通气路径。');
  if(key==='material'&&value!==c.material)d.fuel=1;
  if(this.lab.kind==='metals'&&key!=='sample'&&key in d.samples[c.sample]){const sample=d.samples[c.sample];if(['metal','reagent'].includes(key)&&(sample.introduced||sample.volume))return this.feedback('old-reagent','warning','试管里已有金属或溶液。','直接换选项会混淆原有物质。','清洗当前试管后再换试剂或金属。');sample[key]=value;}
  else if(this.lab.kind==='rust'&&key!=='sample'&&key in d.samples[c.sample])d.samples[c.sample][key]=value;
  else c[key]=value;
  if(this.lab.kind==='filter'&&['stir','guide'].includes(key)){if(value)c[key==='stir'?'guide':'stir']=false;this.positionFilterRod();}
  if(this.workbench&&key==='waterVolume'){this.state.items.cylinder.remaining=value;d.read=false;}
  if(key==='stopper')d.sealChecked=false;
  if(key==='clamp'&&!value){d.halted=false;d.pressure=1;}
  if(key==='electrolyte'&&value==='chloride'){d.power=false;this.feedback('chloride','danger','本探究不能使用含氯电解液。','产物可能不再只有氢气和氧气，模型已断电。','改用本实验指定的非氯化物助导电条件。');}
  this.log('调节',`${spec.label}：${typeof value==='boolean'?(value?'是':'否'):value}${spec.unit||''}`);this.emit();return true;
 }
 select(id){if(this.state.items[id]){this.state.selected=id;this.emit();}}
 move(id,x,z){if(this.workbench&&!this.workbench.moving)return this.workbench.move(id,x,z);const item=this.state.items[id];if(!item||!Number.isFinite(x)||!Number.isFinite(z))return false;const changed=Math.hypot(item.x-clamp(x,-4.3,4.3),item.z-clamp(z,-2.1,2.1))>1e-5;item.x=clamp(x,-4.3,4.3);item.z=clamp(z,-2.1,2.1);item.present=true;
  if(changed&&this.lab.kind==='filter')this.filterApparatusChanged(id);
  for(const link of [...this.state.connections]){const [a,b]=link.map(p=>this.state.items[p.split(':')[0]]);if(Math.hypot(a.x-b.x,a.z-b.z)>5.5){this.state.connections=this.state.connections.filter(l=>l!==link);this.state.data.sealChecked=false;this.feedback('tube-pulled','warning','移动距离过大，导管连接脱开。','气体不会按原路线进入收集装置。','把器材移近，再连接相应接口。');}}
  this.emit();return true;
 }
 toggleItem(id){const item=this.state.items[id];if(!item)return false;if(this.lab.kind==='electrolysis'&&this.state.data.power&&['battery','left','right'].includes(id))return this.feedback('live-apparatus','danger','通电时不能拆下电源或电极。','器材未移出。','先断开电源，再处理装置。');item.present=!item.present;if(!item.present){this.state.connections=this.state.connections.filter(l=>!l.some(p=>p.startsWith(id+':')));this.state.data.sealChecked=false;}if(this.lab.kind==='filter')this.filterApparatusChanged(id,!item.present);this.workbench?.presenceChanged(id);this.workbench?.afterConnect();this.emit();return true;}
 connect(a,b){const choice=this.workbench?.examConnection(a,b);if(choice!==undefined)return choice;const valid=this.lab.links.some(l=>pair(...l)===pair(a,b));if(!valid)return this.feedback('wrong-connection','warning','这两个接口不能这样连接。','没有形成有效通路。','选择本实验的导气口或电源、电极接口。');
  if(![a,b].every(p=>this.state.items[p.split(':')[0]]?.present))return this.feedback('missing-apparatus','warning','器材还没有放到实验台上。','连接未建立。','先把相应器材放到台面。');
  this.state.connections=this.state.connections.filter(l=>!l.includes(a)&&!l.includes(b));this.state.connections.push([a,b]);this.workbench?.afterConnect();this.state.data.sealChecked=false;this.log('连接',`${a} ↔ ${b}`);this.emit();return true;
 }
 connected(a,b){return this.state.connections.some(l=>pair(...l)===pair(a,b));}
 has(id){return this.state.items[id]?.present===true;}
 log(kind,text){this.state.log.push({at:this.state.elapsed,kind,text});if(this.state.log.length>80)this.state.log.shift();}
 feedback(code,severity,message,consequence='',correction='',{repeat=false}={}){this.workbench?.feedback(code,severity,message,correction);const last=[...this.state.alerts].reverse().find(a=>a.code===code&&a.message===message);if(repeat||!last||this.state.elapsed-last.at>5){this.state.alerts.push({code,severity,message,consequence,correction,at:this.state.elapsed});if(this.state.alerts.length>30)this.state.alerts.shift();this.log(severity==='danger'?'异常':'提示',message);}this.emit();return severity==='success'||severity==='info';}
 info(message){return this.feedback('info','info',message);}
 dispatch(action){const s=this.state,d=s.data,c=s.config;if(action==='observe')return this.observe();if(action==='check')return this.check();if(this.workbench&&!this.workbench.executing&&!this.workbench.beforeAction(action))return false;
  if(!this.lab.actions.some(a=>a.id===action))return this.feedback('invalid-action','warning','当前实验没有这个操作。','状态未改变。','使用当前实验台提供的操作。');
  const requirements={gas:action==='test-full'?['collector','splint']:action==='test-gas'?['collector',s.id==='oxygen'?'splint':'limewater']:action==='add-solid'?['flask','solid']:action==='add-liquid'?['flask','reagent']:['flask','collector'],filter:action==='transfer'?['receiver','dish']:action==='heat-toggle'?['dish','heater']:[],solution:['tare','weigh'].includes(action)?['balance']:action==='read-water'?['cylinder']:action==='add-water'?['cylinder','beaker']:action==='stir'?['beaker','rod']:['beaker'],metals:action==='conductivity'?['tester']:['tube'+c.sample],acid:['beaker'],electrolysis:['battery','left','right'],burn:['sample','heater'],air:['copperTube','syringe','receiver'],rust:['tube'+c.sample],mass:['flask','balance']};
  const missing=(requirements[this.lab.kind]||[]).filter(id=>!this.has(id));
  if(missing.length)return this.feedback('missing-apparatus','warning','需要的器材不在实验台上。','操作没有执行。','放回：'+missing.map(id=>s.items[id]?.label||id).join('、')+'。');
  this.log('操作',this.lab.actions.find(a=>a.id===action)?.label||action);
  if(this.lab.kind==='gas')this.gasAction(action);
  else if(this.lab.kind==='filter')this.filterAction(action);
  else if(this.lab.kind==='solution')this.solutionAction(action);
  else if(this.lab.kind==='metals')this.metalAction(action);
  else if(this.lab.kind==='acid')this.acidAction(action);
  else if(this.lab.kind==='electrolysis')this.waterAction(action);
  else if(this.lab.kind==='burn'){if(action==='heat-toggle')d.heater=!d.heater;if(action==='cool'){d.heater=false;c.temperature=25;}}
  else if(this.lab.kind==='air'){if(action==='leak-test'){d.sealChecked=c.sealed&&this.connected('syringe:out','copperTube:in')&&this.connected('copperTube:out','receiver:in');this.info(d.sealChecked?'装置气密性检查通过。':'连接完整且装置密闭后，才能通过气密性检查。');}if(action==='heat-toggle')d.heater=!d.heater;if(action==='read'){if(d.temperature>30)this.feedback('hot-reading','warning','装置尚未冷却，气体热胀影响读数。','当前体积不能直接用于估算原空气组成。','关闭热源，等待温度接近初始温度。');else{d.read=(100-d.volume);s.evidence.read=true;this.info(`以100 mL初始空气估算，氧气约占 ${rnd(d.read)}%。`);}}}
  else if(this.lab.kind==='rust'){const sample=d.samples[c.sample];if(action==='prepare'){sample.prepared=true;if(sample.oil&&sample.oxygen)this.feedback('dissolved-oxygen','warning','加油封不等于已经除去水中氧气。','若未先建立缺氧条件，铁仍可能锈蚀。','明确氧气条件，再以油封保持条件。');}if(action==='expose'){sample.oxygen=true;sample.oil=false;this.feedback('oxygen-returned','warning','封口打开后，氧气条件改变。','原来的缺氧对照不再成立。','重新设计对照或记录条件改变。');}}
  else if(this.lab.kind==='mass'){if(action==='react'){if(c.rigidSeal)return this.feedback('rigid-seal','danger','不能把产气反应封死在刚性容器里。','压强上升有危险，模型未开始混合。','取消硬塞，用可膨胀气球保留气体。');d.reacted=true;}if(action==='release'){c.balloon=false;this.feedback('system-boundary','info','气体现在可以离开称量范围。','天平示数可能下降，但完整反应仍遵守质量守恒。','记录称量系统的边界，再比较读数。');}if(action==='weigh'){d.reading=d.mass;if(d.extent>0.9){if(c.balloon&&!d.escaped)s.evidence.closed=true;else if(d.escaped>0.2)s.evidence.open=true;}this.info(`当前称量系统质量：${d.mass.toFixed(2)} g。`);}}
  this.emit();return true;
 }
 gasAction(action){const s=this.state,d=s.data,c=s.config,isO2=s.id==='oxygen',line=this.connected('flask:out','collector:in');
  if(action==='leak-test'){if(d.gasGenerated>0)return this.feedback('late-leak-test','warning','反应已经开始，不能把现在的检查当作反应前检查。','已有的漏气或混气不能靠补点检查消除。','可继续观察现象；完整练习请重置后先检查装置。');d.sealChecked=line&&c.stopper&&!c.clamp;return this.feedback('seal',d.sealChecked?'success':'warning',d.sealChecked?'气密性检查通过。':'气密性检查未通过。',d.sealChecked?'已连接且瓶塞密闭。':'导管、瓶塞或通路存在问题。','检查导管连接、瓶塞与通路开关。');}
  if(action==='add-solid')d.solid+=c.solidDose;
  if(action==='add-liquid'){d.reagent+=c.dose;if(!d.sealChecked)this.feedback('no-seal-test','warning','尚未通过反应前气密性检查。','本次实验可能漏气，观察结果需要谨慎解释。','完整练习时先连接并检查，再加入反应物。');}
  if(action==='test-gas'){
   if(isO2){if(d.collected>=64&&d.purity>85){s.evidence.identified=true;d.splint=1;this.feedback('o2-test','success','带火星木条复燃。','这支持收集气体具有较强助燃性的判断。','结合反应物和装置证据判断生成了氧气。');}else this.feedback('o2-incomplete','warning','木条没有明显复燃。','可能收集量不足、气体混有空气或装置漏气。','检查连接、瓶口方向和实时收集读数。');}
   else if(d.gasGenerated>10){d.cloudy=true;s.evidence.identified=true;this.feedback('limewater','success','澄清石灰水出现浑浊。','二氧化碳与氢氧化钙生成碳酸钙沉淀。','将该现象与反应原料及其他证据结合。');}else this.feedback('no-sample','warning','尚没有足够的气体样品。','石灰水变化不明显。','让反应产生气体，再取样检验。');
  }
  if(action==='test-full'){if(d.purity>=90){s.evidence.full=true;d.splint=0;this.info('瓶口的燃着木条熄灭，支持已收集充分；气体身份仍需石灰水证据。');}else this.feedback('not-full','warning','瓶口的木条未明显熄灭。','二氧化碳收集还不充分或混有较多空气。','检查漏气、收集方向与反应物余量。');}
 }
 positionFilterRod(){const rod=this.state.items.rod;if(!rod)return;const pose=filterRodPose(this.state);rod.mode=pose?.mode||'rest';if(pose)Object.assign(rod,{x:pose.x,y:pose.y,z:pose.z});else rod.y=0;}
 seatFilterDish(){const {dish,heater}=this.state.items;if(dish) dish.y=heater?.present&&Math.hypot(dish.x-heater.x,dish.z-heater.z)<=.35?(heater.y||0)+.37:.05;}
 interruptFilterHeating(message){const d=this.state.data;d.heater=false;d.heatingInterrupted=true;this.feedback('hot-apparatus-moved','danger',message,'热源已关闭，持续加热中断；器皿仍有余热，会逐渐冷却。','不要徒手移动热器皿。待冷却后重新放稳、对准热源，再手动开启。');}
 filterApparatusChanged(id,removed=false){const {config:c,data:d}=this.state;const heating=d.heater;
  if(id==='rod'){const active=c.stir||c.guide;c.stir=false;c.guide=false;this.positionFilterRod();if(active)this.feedback('rod-displaced','warning',removed?'玻璃棒已移出，原来的引流或搅拌中断。':'玻璃棒已被移开，原来的引流或搅拌中断。',heating?'热源仍开启，但已不再持续搅拌，可能局部过热。':'勾选状态已取消，不再把这次位置当作正确操作。','将玻璃棒放回，再选择沿棒引流或持续搅拌。');}
  if(id==='dish'&&c.stir){c.stir=false;this.positionFilterRod();}
  if(id==='funnel'&&c.guide){c.guide=false;this.positionFilterRod();this.feedback('guide-displaced','warning','漏斗位置改变，原来的玻璃棒引流位置已失效。','引流状态已取消。','对准接收烧杯后，重新设置玻璃棒引流。');}
  if(['dish','heater'].includes(id)){this.seatFilterDish();this.positionFilterRod();if(heating)this.interruptFilterHeating((removed?'加热中移出了':'加热中移动了')+(id==='dish'?'蒸发皿。':'热源。'));else if(id==='dish'&&d.temperature>40&&!d.heatingInterrupted)this.feedback('hot-dish','warning','蒸发皿仍然较热。','即使已经关热源，余热也不会立即消失。','不要徒手移动，待冷却后再处理。');}
 }
 filterAction(action){const s=this.state,d=s.data,c=s.config;if(action==='pour'){
   if(!this.has('feed')||!this.has('funnel')||!this.has('receiver'))return this.feedback('filter-missing','warning','缺少过滤所需器材。','倾倒没有进行。','把烧杯、漏斗和接收烧杯放回台面。');
   const n=Math.min(10,d.feed);if(!n)return this.info('原粗盐溶液已用完，可重置实验重新取样。');d.feed-=n;d.stream=1;
   if(Math.hypot(s.items.funnel.x-s.items.receiver.x,s.items.funnel.z-s.items.receiver.z)>0.9)return this.feedback('misaligned','warning','漏斗没有对准接收烧杯。','这部分液体洒失，未进入滤液。','拖动漏斗或接收烧杯，使两者对齐。');
   d.filtrate+=n;if(!c.paper||c.pourRate>3){d.dirty=true;this.feedback('dirty-filtrate','warning',!c.paper?'没有滤纸，泥沙进入接收烧杯。':'倒得过快，可能越过滤纸边缘。','本次滤液仍混有难溶性杂质。','清空接收烧杯，装好滤纸并降低倾倒速率。');}
   else if(!c.guide||!c.wetPaper)this.feedback('filter-technique','warning','引流或滤纸贴合还不规范。','容易飞溅或影响过滤过程。','润湿滤纸，并沿玻璃棒缓慢倾倒。');
   else{s.evidence.filtered=!d.dirty;this.info('液体通过滤纸，难溶性泥沙被截留。');}
  }
  if(action==='transfer'){d.dish+=d.filtrate;d.dishDirty||=d.dirty;d.filtrate=0;d.dirty=false;}
  if(action==='empty'){d.filtrate=0;d.dirty=false;}
  if(action==='heat-toggle'){if(!d.heater){if(!filterHeatContact(s.items))return this.feedback('dish-off-heater','warning','蒸发皿没有放稳在热源上。','没有开始加热。','把蒸发皿移到电热板中心，放稳后再开启。');if(!d.dish)return this.feedback('empty-heating','warning','蒸发皿中没有滤液。','未开启热源，避免空皿干烧。','先转移澄清滤液，再使用热源。');d.heatingInterrupted=false;d.heater=true;}else{d.heater=false;if(d.crystals>0&&d.dish>0&&d.dish<5&&c.stir&&this.has('rod')){s.evidence.stopInTime=true;this.info('仍有少量液体时停止加热，利用余热继续蒸发。');}}this.positionFilterRod();}
 }
 solutionAction(action){const s=this.state,d=s.data,c=s.config;
  if(action==='tare'){d.tared=c.paper;return this.info(c.paper?'称量纸放好后去皮，天平归零。':'未放称量纸；请放纸后再去皮。');}
  if(action==='weigh'){d.salt+=c.saltMass-(c.paper&&!d.tared?.2:0);d.salt=Math.max(0,d.salt);d.dissolved=false;if(!d.tared)this.feedback('not-tared','warning','称量前没有正确去皮。','实际转移的盐质量与目标读数有偏差。','重置配制，放好称量纸并去皮后称量。');}
  if(action==='read-water'){d.read=Math.abs(c.eyeAngle)<3;this.feedback('meniscus',d.read?'success':'warning',d.read?'视线与凹液面最低处水平。':'视线没有与液面最低处水平。',d.read?`量筒实际水量为 ${c.waterVolume} mL。`:`${c.eyeAngle>0?'俯视读数通常偏大':'仰视读数通常偏小'}。`,'把视线角度调回0°，再读取体积。');}
  if(action==='add-water'){d.water+=c.waterVolume;d.dissolved=false;if(!d.read)this.feedback('unread-water','warning','尚未正确读取量筒体积。','配制过程缺少可靠量取证据。','平视读数后再量取；可重置重新配制。');}
  if(action==='stir'){d.dissolved=d.water>0&&d.salt<=d.water*0.36;if(!d.dissolved)this.feedback('undissolved','warning','仍有未溶解的固体或缺少水。','不能把剩余固体当成已溶溶质。','检查水、盐用量和溶解能力。');else this.info('氯化钠已充分溶解。');}
  if(action==='label'){d.labelled=d.dissolved;const w=d.salt/(d.salt+d.water||1)*100;if(d.dissolved)this.info(`依据实际加入量，标签应写氯化钠质量分数 ${w.toFixed(2)}%。`);else this.feedback('label-too-early','warning','溶液还未配制完成。','不能确认标签浓度。','先完成称量、量取和溶解。');}
 }
 metalAction(action){const s=this.state,c=s.config,d=s.data,m=d.samples[c.sample];
  if(action==='wash'){d.samples[c.sample]={metal:m.metal,reagent:m.reagent,volume:0,area:m.area,polished:false,introduced:false,extent:0,elapsed:0};return;}
  if(action==='polish'){m.polished=true;return this.info('金属表面已打磨，减少氧化膜和接触影响。');}
  if(action==='dose'){m.volume+=c.volume;for(const other of d.samples)if(other!==m&&other.volume&&other.reagent===m.reagent&&(other.volume!==m.volume||other.area!==m.area))this.feedback('uncontrolled','warning','对照试管的用量或表面积不一致。','反应快慢的差异不能只归因于金属种类。','控制溶液用量、金属表面积等条件再比较。');}
  if(action==='metal')m.introduced=true;
  if(action==='conductivity'){d.lamp=m.polished;if(m.polished){s.evidence.physical=true;this.info('金属接入后灯泡亮起，支持其具有导电性。');}else this.feedback('poor-contact','warning','接触不良，导电测试不明显。','不能据此断言金属不导电。','打磨接触处，再测试。');}
 }
 acidAction(action){const s=this.state,d=s.data,c=s.config;if(action==='add-acid'||action==='add-base'){
  const key=action==='add-acid'?'acid':'base',before=d.acid-d.base;d[key]+=c.dose;
  if(before*(d.acid-d.base)<0&&c.dose>1)this.feedback('overshoot','warning','本次加液越过了接近中和的位置。','颜色变化后仍可能存在酸或碱过量。','减小每次加入量，结合pH和温度观察。');
 }
 if(action==='indicator'){d.indicator=true;this.info('已加入少量指示剂，颜色将随溶液状态变化。');}
 if(action==='clean-paper')c.paperWet=false;
 if(action==='dip-bottle')return this.feedback('contaminate-stock','danger','不能将试纸直接伸入试剂原瓶。','可能污染原瓶，模型没有执行该操作。','取少量样品，用干净玻璃棒蘸取液体测量。');
 if(action==='measure'){if(c.paperWet)return this.feedback('wet-ph-paper','warning','pH试纸被水润湿。','样品被稀释，读数不能作为可靠结果。','换用干燥试纸再测量。');d.reading=d.pH;s.evidence.measured=true;if(d.pH<6)s.evidence.acid=true;if(d.pH>8)s.evidence.base=true;if(Math.abs(d.pH-7)<0.5&&d.acid>0&&d.base>0)s.evidence.neutral=true;this.info(`本次pH读数：${d.pH.toFixed(2)}。${d.indicator&&c.indicator==='phenol'&&d.pH<8.2?'酚酞无色不能单独说明恰好中和。':''}`);}
 this.updateAcid(0);
 }
 waterAction(action){const s=this.state,d=s.data,c=s.config;if(action==='power-toggle'){
  const pol=this.polarities();if(!d.power&&c.voltage<=0)return this.feedback('zero-voltage','warning','电源电压为0，不能形成电解现象。','电源没有接通。','设置适当低电压，并检查连接。');if(!d.power&&(!pol||c.electrolyte==='chloride'))return this.feedback('electrolysis-setup','danger',c.electrolyte==='chloride'?'含氯电解液不适用本次水组成探究。':'电源正、负极尚未分别接到两侧电极。','电源保持断开。','连接不同电极，并使用本实验允许的导电条件。');d.power=!d.power;
 }
 if(action==='test-left'||action==='test-right'){const side=action==='test-left'?'left':'right';if(d.power)return this.feedback('test-live','danger','检验气体前请先断开电源。','当前检验未执行。','断电后按实验要求识别气体。');const vol=d[side+'Gas'];if(vol<1)return this.feedback('little-gas','warning','气体样品不足。','暂不能形成可靠检验证据。','检查电路、导电条件和收集情况。');const pol=this.polarities();if(!pol)return this.info('请保留电极连接信息，以判断样品与电极的关系。');s.evidence[side]=true;this.info(pol[side]==='-'?'该侧连接负极，产物为氢气；现实中的燃烧检验还须符合验纯与防护要求。':'该侧连接正极，产物为氧气，可支持带火星木条复燃。');}
 }
 polarities(){const result={};for(const [a,b]of this.state.connections){const battery=[a,b].find(p=>p.startsWith('battery:')),tube=[a,b].find(p=>p.startsWith('left:')||p.startsWith('right:'));if(battery&&tube)result[tube.split(':')[0]]=battery.split(':')[1];}return result.left&&result.right&&result.left!==result.right?result:null;}
 advance(seconds){if(this.state.paused||!Number.isFinite(seconds)||seconds<=0)return;let remaining=Math.min(seconds,1)*clamp(this.state.speed,1,60);while(remaining>1e-7){const dt=Math.min(0.1,remaining);this.tick(dt);remaining-=dt;}return this.state;}
 tick(dt){const s=this.state,d=s.data,c=s.config;if(s.failure){if(this.lab.kind==='filter')d.temperature+=(25-d.temperature)*Math.min(1,dt*.15);return;}s.elapsed+=dt;
  if(this.lab.kind==='gas'){
   const o2=s.id==='oxygen',limit=o2?d.reagent*10.89:Math.min(d.solid/100.09,d.reagent/1000/2)*24450;
   let rate=Math.max(0,limit-d.gasGenerated)*(o2?(d.solid?0.14+d.solid*.12:.002):.16);if(!o2&&c.acid==='sulfuric'&&d.gasGenerated>10){rate*=.002;this.feedback('sulfate-crust','warning','固体表面逐渐形成硫酸钙覆盖层。','气体生成明显受阻。','比较后重新选择适当稀酸制取二氧化碳。');}
   if(d.halted)rate=0;const produced=Math.min(Math.max(0,limit-d.gasGenerated),rate*dt);d.gasGenerated+=produced;
   if(c.clamp&&c.stopper&&produced>0){d.pressure+=produced*.004;if(d.pressure>1.3){d.halted=true;this.feedback('pressure','danger','导气通路堵塞，压强正在升高。','模型暂停反应，不能继续照此操作。','解除堵塞，保持合理的排气或收集通路。');}}
   else if(c.stopper&&this.connected('flask:out','collector:in')){
    const correct=c.collection==='water'?c.inverted:!c.inverted;
    if(correct){const received=produced*(s.id==='carbon'&&c.collection==='water'?.45:1);d.through+=received;d.collected=Math.min(80,d.collected+received);d.purity=c.collection==='water'?99.5:(1-Math.exp(-d.through/80))*100;}
    else if(produced>0.001)this.feedback('jar-direction','warning','集气瓶方向与当前收集方法不相符。','气体没有被有效收集。','排水收集时倒置；向上排空气收集时瓶口向上。');
    if(s.id==='carbon'&&c.collection==='water'&&produced>0.001)this.feedback('co2-water-loss','warning','二氧化碳能溶于水，排水收集出现损失。','收集结果受到溶解影响。','通常选择向上排空气法。');
   }
   d.splint=Math.max(0,(d.splint||0)-dt*.15);
  }
  if(this.lab.kind==='filter'){
   if(d.heater&&!filterHeatContact(s.items))this.interruptFilterHeating('蒸发皿与热源失去有效接触。');this.positionFilterRod();
   d.stream=Math.max(0,(d.stream||0)-dt);d.temperature+=(d.heater?100-d.temperature:25-d.temperature)*dt*.15;
   if((d.heater||d.temperature>55)&&d.dish>0){const amount=Math.min(d.dish,(d.heater?c.heat/100*.8:(d.temperature-25)/75*.1)*dt);d.dish-=amount;d.crystals+=amount*.08;
    if(d.heater&&!c.stir&&d.temperature>65)this.feedback('no-stir','warning','蒸发时没有持续搅拌。','局部过热可能造成液滴飞溅。','用玻璃棒搅拌，关注剩余液体量。');
    if(d.heater&&d.dish>0.01&&d.dish<5)this.feedback('near-dry','info','已出现晶体，蒸发皿仍有少量液体。','继续加热可能使液体全干。','可关闭热源，利用余热继续蒸发。');
    if(d.heater&&d.dish<0.01&&!s.evidence.stopInTime)this.feedback('dry-heating','danger','液体已基本蒸干，仍在加热。','不应持续干烧，应避免飞溅与高温风险。','在仍有少量液体时停热，利用余热。');
   }
  }
  if(this.lab.kind==='metals')for(const m of d.samples){if(!m.introduced||m.volume<=0)continue;m.elapsed+=dt;const rate=(m.metal==='Mg'?.2:m.metal==='Fe'?.06:0)*m.area*(m.polished?1:.2);m.extent=clamp(m.extent+rate*dt,0,1);if(m.reagent==='hcl'&&m.elapsed>2){if(m.metal==='Mg'&&m.extent>.1)s.evidence.Mg=true;if(m.metal==='Fe'&&m.extent>.05)s.evidence.Fe=true;if(m.metal==='Cu')s.evidence.Cu=true;}if(m.reagent==='copper'&&m.metal==='Fe'&&m.extent>.15)s.evidence.displacement=true;}
  if(this.lab.kind==='acid')this.updateAcid(dt);
  if(this.lab.kind==='electrolysis'&&d.power){const pol=this.polarities();if(!pol||c.electrolyte==='chloride'){d.power=false;return;}const current=c.voltage*(c.electrolyte==='pure'?.00005:.035);const hydrogen=current/(2*96485)*24450*dt;d.leftGas+=hydrogen*(pol.left==='-'?1:.5);d.rightGas+=hydrogen*(pol.right==='-'?1:.5);if(c.electrolyte==='pure')this.feedback('pure-water','info','纯水导电很弱，气体生成很慢。','缓慢不等于电路一定损坏。','比较导电条件，或调整模型时间倍率。');}
  if(this.lab.kind==='burn'){
   d.temperature+=((d.heater?c.temperature:25)-d.temperature)*Math.min(1,dt*.8);d.oxygen=c.covered?Math.max(0,d.oxygen-dt*(d.burning?1.5:0)):c.oxygen;
   d.burning=c.material==='wood'&&d.temperature>=300&&d.oxygen>12&&d.fuel>0;
   if(d.burning)d.fuel=Math.max(0,d.fuel-dt*.003);
  }
  if(this.lab.kind==='air'){
   const connected=this.connected('syringe:out','copperTube:in')&&this.connected('copperTube:out','receiver:in');d.temperature+=((d.heater?25+c.heat*3:25)-d.temperature)*Math.min(1,dt*.12);
   if(d.temperature>100&&connected){const max=Math.min(20.9,c.copperMass/63.55/2*24450);d.oxygenUsed=Math.min(max,d.oxygenUsed+dt*.7);if(!c.sealed)this.feedback('air-leak','warning','体系没有密闭。','体积变化不能只归因于消耗氧气。','重新连接并检查气密性，再作定量比较。');}
   d.volume=(100-d.oxygenUsed)*(d.temperature+273.15)/298.15;if(!c.sealed)d.volume+=(100-d.volume)*Math.min(1,dt*.2);
  }
  if(this.lab.kind==='rust'){d.hours+=dt*.2;for(const m of d.samples)if(m.prepared&&m.water&&m.oxygen)m.rust=clamp(m.rust+dt*.004*(m.saltwater?1.5:1),0,1);}
  if(this.lab.kind==='mass'&&d.reacted){d.extent=clamp(d.extent+dt*.08,0,1);if(!c.balloon)d.escaped=Math.min(.44*d.extent,d.escaped+dt*.045);d.mass=100-d.escaped;}
 }
 updateAcid(dt){const d=this.state.data,c=this.state.config,total=d.acid+d.base;if(!total){d.pH=7;return;}const excess=(d.acid-d.base)*.1/total;d.pH=Math.abs(excess)<1e-9?7:excess>0?-Math.log10(excess):14+Math.log10(-excess);d.pH=clamp(d.pH,0,14);const rise=Math.min(d.acid,d.base)*.1*57.3/(Math.max(total,1)*4.18);d.temperature=25+rise;if(d.indicator){if(d.pH<6)this.state.evidence.indicatorAcid=true;if(d.pH>8.3)this.state.evidence.indicatorBase=true;}}
 color(){const d=this.state.data,c=this.state.config;if(this.lab.kind==='acid'){if(!d.indicator)return '#c5e8f5';if(c.indicator==='phenol')return d.pH>8.2?'#e648a0':'#d4eef6';if(c.indicator==='litmus')return d.pH<5?'#e96a81':d.pH>8?'#617dde':'#b799d8';return d.pH<3?'#ef6873':d.pH<6?'#edb854':d.pH<8?'#80b77b':d.pH<11?'#649bd0':'#b276cd';}return '#a4d9ed';}
 observe(note=''){const s=this.state,d=s.data,c=s.config;if(this.lab.kind==='burn'){
   const trials=s.evidence.trials??=[];trials.push({material:c.material,oxygen:d.oxygen,temperature:d.temperature,burning:d.burning});if(trials.length>30)trials.shift();
   const reference=trials.find(v=>v.burning);
   if(reference){s.evidence.burning=true;for(const trial of trials){const differences=[trial.material!==reference.material,(trial.oxygen>12)!==(reference.oxygen>12),(trial.temperature>=300)!==(reference.temperature>=300)].filter(Boolean).length;
    const key=trial.material!=='wood'?'noFuel':trial.oxygen<=12?'noOxygen':trial.temperature<300?'cold':'burning';if(differences===1)s.evidence[key]=true;}
    const latest=trials.at(-1),differences=[latest.material!==reference.material,(latest.oxygen>12)!==(reference.oxygen>12),(latest.temperature>=300)!==(reference.temperature>=300)].filter(Boolean).length;if(differences>1)this.feedback('multiple-variables','warning','与燃烧基准相比，改变了多个条件。','这一对照不能把现象归因于单一变量。','恢复其他条件，只保留一个条件不同。');}
  }
  if(this.lab.kind==='rust'){const samples=d.samples.filter(m=>m.prepared);if(new Set(samples.map(m=>Boolean(m.saltwater))).size<=1&&samples.some(m=>m.water&&m.oxygen&&m.rust>.15)&&samples.some(m=>!m.water&&m.oxygen&&m.rust<.05)&&samples.some(m=>m.water&&!m.oxygen&&m.rust<.05))s.evidence.comparison=true;}
  const observation={time:rnd(s.elapsed),readings:this.readings(),note:String(note).slice(0,1500),conditions:structuredClone(s.config),actual:structuredClone(s.data),apparatus:Object.values(s.items).map(({id,x,z,present})=>({id,x,z,present})),connections:structuredClone(s.connections)};s.observations.push(observation);if(s.observations.length>30)s.observations.shift();this.log('记录','已保存一次观察快照');this.emit();return observation;
 }
 criteria(){const s=this.state,d=s.data,c=s.config,e=s.evidence;const checks=[];const add=(label,met)=>checks.push({label,met:Boolean(met)});
  if(this.lab.kind==='gas'){add('反应前通过气密性检查',d.sealChecked);add('选择合适的收集方式与方向',c.stopper&&!c.clamp&&this.connected('flask:out','collector:in')&&(s.id==='oxygen'?(c.collection==='water'?c.inverted:!c.inverted):(c.collection==='air'&&!c.inverted)));add('收集量与纯度足够',d.collected>=64&&d.purity>=90);add(s.id==='oxygen'?'获得木条复燃证据':'获得石灰水检验证据',e.identified);if(s.id==='carbon')add('在瓶口获得验满证据',e.full);}
  if(this.lab.kind==='filter'){add('过滤得到澄清滤液',e.filtered);add('从澄清滤液得到晶体',d.crystals>.5&&!d.dishDirty);add('搅拌并在仍有余液时停热',c.stir&&e.stopInTime);}
  if(this.lab.kind==='solution'){add('放纸后正确去皮',d.tared);add('平视量筒并加入目标水量',d.read&&Math.abs(d.water-45)<.2);add('氯化钠用量为5 g',Math.abs(d.salt-5)<.05);add('充分溶解并正确贴标签',d.dissolved&&d.labelled);}
  if(this.lab.kind==='metals'){add('取得金属导电性证据',e.physical);add('比较Mg、Fe、Cu与酸的现象',e.Mg&&e.Fe&&e.Cu);add('观察铁置换铜的现象',e.displacement);}
  if(this.lab.kind==='acid'){add('观察到酸性与碱性指示剂现象',e.indicatorAcid&&e.indicatorBase);add('用可靠测量获得pH证据',e.measured&&!c.paperWet);if(s.id==='neutralization'){add('在近中和位置测得pH',e.neutral);add('同时观察到温度变化',d.temperature>25.2);}}
  if(this.lab.kind==='electrolysis'){const p=this.polarities();const h=p?(p.left==='-'?d.leftGas:d.rightGas):0,o=p?(p.left==='+'?d.leftGas:d.rightGas):0;add('电源正、负极接到不同电极',p);add('相同条件下氢、氧体积约为2∶1',o>1&&Math.abs(h/o-2)<.05);add('断电后识别两侧气体',!d.power&&e.left&&e.right);}
  if(this.lab.kind==='burn'){add('三个条件都满足时观察到燃烧',e.burning);add('分别只改变可燃物、氧气、温度作对照',e.noFuel&&e.noOxygen&&e.cold);}
  if(this.lab.kind==='air'){add('反应前检查完整密闭装置',d.sealChecked&&c.sealed);add('铜足量且氧气充分消耗',d.oxygenUsed>20.5);add('冷却后读到合理氧气体积分数',e.read&&d.temperature<30&&Math.abs(d.read-20.9)<2);}
  if(this.lab.kind==='rust')add('记录潮湿有氧、干燥有氧、缺氧有水的对照',e.comparison);
  if(this.lab.kind==='mass'){add('用可膨胀气球保留气体，称量不变',e.closed);add('比较气体逸出后的称量变化',e.open);}
  if(this.workbench&&s.failure)add('本次实验失败，需要重置后重新尝试',false);return checks;
 }
 check(){const criteria=this.criteria(),ok=criteria.length>0&&criteria.every(c=>c.met);this.feedback('check',ok?'success':'info',ok?'观察与操作证据已达到本实验目标。':'仍有证据需要补充。',ok?'可整理实验记录，解释现象与误差。':criteria.filter(c=>!c.met).map(c=>c.label).join('；'),'目标清单可按实际条件完成，不要求点击固定步骤。');return {ok,criteria};}
 readings(){const d=this.state.data,c=this.state.config,kind=this.lab.kind;const r=(label,value,unit='')=>({label,value:typeof value==='number'?rnd(value):value,unit});
  if(kind==='gas')return[r('气体生成量',d.gasGenerated,'mL'),r('已收集',d.collected,'/80 mL'),r('收集气体比例（混合模型）',d.purity,'%'),r('通路压强趋势',d.pressure,'相对值'),r('气密性',d.sealChecked?'已检查':'未通过')];
  if(kind==='filter')return[r('原液剩余',d.feed,'mL'),r('接收烧杯',d.filtrate,'mL'),r('蒸发皿余液',d.dish,'mL'),r('晶体趋势',d.crystals,'模型量'),r('滤液',d.dirty?'混浊':'未见泥沙'),r('热源',d.heater?'正在加热':d.heatingInterrupted?'已中断':'关闭'),r('蒸发皿温度',d.temperature,'°C'),r('放置位置',filterHeatContact(this.state.items)?'对准热源':'未对准热源')];
  if(kind==='solution')return[r('盐的实际质量',d.salt,'g'),r('水的实际质量',d.water,'g'),r('溶液总质量',d.salt+d.water,'g'),r('溶质质量分数',d.salt/(d.salt+d.water||1)*100,'%'),r('视线',c.eyeAngle===0?'平视':c.eyeAngle>0?'俯视':'仰视')];
  if(kind==='metals')return d.samples.map((m,i)=>r('试管'+['A','B','C'][i],!m.introduced||!m.volume?'等待接触':m.metal==='Cu'?'未见明显反应':m.reagent==='copper'?`析铜趋势 ${Math.round(m.extent*100)}%`:`气泡趋势 ${Math.round(m.extent*100)}%`));
  if(kind==='acid')return[r('稀酸',d.acid,'mL'),r('稀碱',d.base,'mL'),r('pH（理想模型）',d.pH),r('温度（热量模型）',d.temperature,'°C'),r('最近有效pH读数',d.reading===null?'未测量':d.reading)];
  if(kind==='electrolysis'){const p=this.polarities();return[r('电源',d.power?'接通':'断开'),r('左侧气体',d.leftGas,'mL'),r('右侧气体',d.rightGas,'mL'),r('左侧电极',p?.left||'未接通'),r('右侧电极',p?.right||'未接通')];}
  if(kind==='burn')return[r('材料温度',d.temperature,'°C'),r('观察室氧气',d.oxygen,'%'),r('燃烧现象',d.burning?'正在燃烧':'未持续燃烧'),r('可燃物',c.material==='wood'?'木片':'石块')];
  if(kind==='air')return[r('装置温度',d.temperature,'°C'),r('当前气体体积',d.volume,'mL'),r('已消耗氧气',d.oxygenUsed,'mL'),r('冷却读数估算',d.read===null?'尚未读取':d.read,'%')];
  if(kind==='rust')return[r('模型时间',d.hours,'小时'),...d.samples.map((m,i)=>r('试管'+['A','B','C'][i],m.rust*100,'%锈蚀趋势'))];
  if(kind==='mass')return[r('反应进度',d.extent*100,'%'),r('离开称量系统的气体',d.escaped,'g'),r('称量系统质量',d.mass,'g'),r('气体保留',c.balloon?'气球内':'可逸出')];return[];
 }
 report(){return {labId:this.lab.id,labName:this.lab.name,createdAt:new Date().toISOString(),criteria:this.criteria(),observations:structuredClone(this.state.observations),log:structuredClone(this.state.log),alerts:structuredClone(this.state.alerts),modelNote:this.lab.principle,failure:structuredClone(this.state.failure||null),assemblies:structuredClone(this.state.assembly||{}),examEvents:structuredClone(this.state.examEvents||[])};}
}
