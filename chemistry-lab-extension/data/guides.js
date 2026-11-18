// The same operations drive the demonstration and define observable practice evidence.
const set=(key,value)=>({type:'set',key,value}),act=id=>({type:'act',id}),link=(a,b)=>({type:'link',a,b}),select=id=>({type:'select',id});
const step=(title,text,tip,focus,operations=[],seconds=0,ready=()=>true,targets=[])=>({title,text,tip,focus,operations,seconds,ready,targets});
const gasSetup=[link('flask:out','collector:in'),act('leak-test')];
const finish=step('整理证据与结论','回看真实读数，把观察到的现象、支持的结论和可能的误差分开记录。演示只是一个合理方案，你可以回到自己的实验台改变条件作比较。','练习中点击“记录观察”，再检查已有证据；不要把看过演示当作自己已完成实验。','', [act('observe'),act('check')],0,e=>e.criteria().every(c=>c.met),['#recordObservation','#checkLab']);
const acidSteps=()=>[
 step('选择指示剂','先认识稀酸、稀碱和指示剂。本演示选酚酞，用实际加入量比较碱性、近中和和酸性条件。','在操作面板选择指示剂并加入；取用试剂时避免污染原瓶。','indicator',[set('indicator','phenol'),act('indicator')],0,e=>e.state.data.indicator,['[data-param="indicator"]','[data-lab-action="indicator"]']),
 step('观察碱性溶液','加入一毫升稀碱。酚酞呈红色，pH大于七。颜色是性质的线索，还要用可靠读数补充证据。','滴加稀碱，再用干燥试纸测量；检查pH和颜色。','base',[set('dose',1),act('add-base'),act('measure')],0,e=>e.state.evidence.indicatorBase&&e.state.evidence.base,['[data-lab-action="add-base"]','[data-lab-action="measure"]']),
 step('接近中和，比较温度','缓慢加入等体积、等浓度的稀酸，模型接近中和，pH约七。酚酞变无色，但无色不能单独证明恰好中和，要结合pH和温度变化判断。','控制每次用量，滴加稀酸并测量；若已加过量，可重置本次实验重新比较。','acid',[act('add-acid'),act('measure')],0,e=>e.state.evidence.neutral,['[data-param="dose"]','[data-lab-action="add-acid"]','[data-lab-action="measure"]']),
 step('继续滴加，判断酸过量','再加入稀酸，pH降到七以下，酚酞仍然无色。这个对照说明：相同的无色现象，可能对应近中性，也可能对应酸性。','继续滴加少量稀酸并测量，比较当前读数与上一次记录。','probe',[act('add-acid'),act('measure')],0,e=>e.state.evidence.acid,['[data-lab-action="add-acid"]','[data-lab-action="measure"]']),finish];
export const GUIDES={
 oxygen:[
  step('连接并检查气密性','把反应瓶的导气口连到集气瓶入口，检查瓶塞和通路。先检查装置，再加反应物，才能减少漏气对实验的影响。','展开“连接器材”连接两个接口，再点“检查气密性”。','flask',gasSetup,0,e=>e.state.data.sealChecked,['#connectionControls','[data-lab-action="leak-test"]']),
  step('选择排水收集','氧气不易溶于水，本演示采用排水法。集气瓶倒置在水槽中，让生成的气体进入并排出水。','选择排水法、集气瓶倒置，保持反应瓶塞紧、导气通路打开。','collector',[set('collection','water'),set('inverted',true)],0,e=>e.getParam('collection')==='water'&&e.getParam('inverted'),['[data-param="collection"]','[data-param="inverted"]']),
  step('加入催化剂和反应物','加入少量二氧化锰，再加入过氧化氢溶液。二氧化锰加快分解，氧气的理论总量仍由反应物用量决定。','分别加入二氧化锰和过氧化氢；观察反应瓶和气泡。','reagent',[act('add-solid'),act('add-liquid')],0,e=>e.state.data.solid>0&&e.state.data.reagent>0,['[data-lab-action="add-solid"]','[data-lab-action="add-liquid"]']),
  step('收集并观察排水','氧气经过导管进入集气瓶，水面逐渐下降。注意气体生成量与收集量并不总相同，漏气或错误朝向都会影响收集。','保持模拟时间运行，可调快倍率，等收集量和纯度达到检验条件。','collector',[],35,e=>e.state.data.collected>=64&&e.state.data.purity>=90,['#playPause','#timeScale']),
  step('用带火星木条检验','收集充分后，用带火星木条检验。木条复燃支持气体具有较强助燃性的判断，再结合反应物和装置判断生成了氧气。','点“用带火星木条检验”，观察木条和反馈。','splint',[act('test-gas')],0,e=>e.state.evidence.identified,['[data-lab-action="test-gas"]']),finish],
 carbon:[
  step('连接装置并检查','把发生装置连到集气瓶，检查瓶塞、导管和通路。不要等反应开始后再把检查补记成反应前检查。','连接接口，并在加入反应物前检查气密性。','flask',gasSetup,0,e=>e.state.data.sealChecked,['#connectionControls','[data-lab-action="leak-test"]']),
  step('选择向上排空气法','二氧化碳密度通常比空气大，并能溶于水。这里让集气瓶瓶口向上，用排空气法收集，避免排水收集带来的溶解损失。','收集方式选排空气法，取消集气瓶倒置；酸选稀盐酸。','collector',[set('collection','air'),set('inverted',false),set('acid','hcl')],0,e=>e.getParam('collection')==='air'&&!e.getParam('inverted')&&e.getParam('acid')==='hcl',['[data-param="collection"]','[data-param="inverted"]','[data-param="acid"]']),
  step('加入石灰石和稀盐酸','石灰石中的碳酸钙和稀盐酸反应生成二氧化碳。稀硫酸可能形成覆盖层，不适合作为本实验的常规替代。','加入石灰石与稀酸，观察气泡；不要堵死产气通路。','reagent',[act('add-solid'),act('add-liquid')],0,e=>e.state.data.solid>0&&e.state.data.reagent>0,['[data-lab-action="add-solid"]','[data-lab-action="add-liquid"]']),
  step('观察空气逐渐被置换','随着二氧化碳不断通入，瓶内空气逐渐被置换。读数中的比例是混合模型的近似，不是肉眼能看到的气体颜色。','保持通路打开，等待收集比例足够；可提高时间倍率。','collector',[],90,e=>e.state.data.collected>=64&&e.state.data.purity>=90,['#timeScale']),
  step('石灰水检验身份','取气体通入澄清石灰水，观察到浑浊。这是二氧化碳的常见检验证据，应与原料和反应条件结合判断。','点击石灰水检验，观察烧杯颜色及反馈。','limewater',[act('test-gas')],0,e=>e.state.evidence.identified,['[data-lab-action="test-gas"]']),
  step('在瓶口验满','把燃着木条放在瓶口，熄灭支持已收集充分。验满和检验的目的不同，木条熄灭不能单独证明气体是二氧化碳。','点击“在瓶口验满”，比较它与石灰水检验的证据。','splint',[act('test-full')],0,e=>e.state.evidence.full,['[data-lab-action="test-full"]']),finish],
 purify:[
  step('从溶解开始，准备过滤','粗盐先用适量水溶解。本实验台从已经溶解的粗盐溶液开始，盐在水中，泥沙仍是难溶性杂质。装好并润湿滤纸，准备玻璃棒。','勾选装好滤纸、润湿滤纸、沿玻璃棒引流；将漏斗对准接收烧杯。','funnel',[set('paper',true),set('wetPaper',true),set('guide',true),set('pourRate',2)],0,e=>e.getParam('paper')&&e.getParam('wetPaper')&&e.getParam('guide')&&Math.hypot(e.state.items.funnel.x-e.state.items.receiver.x,e.state.items.funnel.z-e.state.items.receiver.z)<.9,['[data-param="paper"]','[data-param="wetPaper"]','[data-param="guide"]']),
  step('沿玻璃棒缓慢过滤','让液体沿玻璃棒进入漏斗，保持液面低于滤纸边缘。泥沙被截留，溶解的盐随水通过滤纸；过滤不能除掉溶解的盐。','低速倾倒两次，观察滤液；混浊时先清空接收烧杯，再检查滤纸和倾倒速率。','feed',[act('pour'),act('pour')],0,e=>e.state.evidence.filtered&&e.state.data.filtrate>=20&&!e.state.data.dirty,['[data-lab-action="pour"]','[data-param="pourRate"]']),
  step('转移澄清滤液','把澄清滤液移入蒸发皿，准备蒸发结晶。若滤液仍有泥沙，直接蒸发会把杂质一起留下。','确认滤液澄清后，点击转移滤液。','dish',[act('transfer')],0,e=>e.state.data.dish>0&&!e.state.data.dishDirty,['[data-lab-action="transfer"]']),
  step('边搅拌边蒸发','打开热源，用玻璃棒持续搅拌，减少局部过热。观察晶体逐渐出现，并留意蒸发皿中的剩余液体。','勾选持续搅拌、功率设50%，打开热源；余液降到少量时准备停热。','heater',[set('stir',true),set('heat',50),act('heat-toggle')],41,e=>e.state.data.crystals>.5&&e.state.data.dish>0&&e.state.data.dish<5,['[data-param="stir"]','[data-param="heat"]','[data-lab-action="heat-toggle"]']),
  step('有余液时停止加热','看到较多晶体且仍有少量液体时停止加热，利用余热继续蒸发。不要为了得到全干的盐而持续干烧。','及时关闭热源，观察余热效应，并说明过滤与蒸发各自的作用。','dish',[act('heat-toggle')],2,e=>e.state.evidence.stopInTime&&!e.state.data.heater,['[data-lab-action="heat-toggle"]']),finish],
 solution:[
  step('计算配制用量','要配制五十克、百分之十的氯化钠溶液，需要五克盐和四十五克水。模型中水的密度近似为一克每毫升。','计划称盐设5克，量筒中水量设45毫升，检查总质量关系。','balance',[set('saltMass',5),set('waterVolume',45)],0,e=>e.getParam('saltMass')===5&&e.getParam('waterVolume')===45,['[data-param="saltMass"]','[data-param="waterVolume"]']),
  step('放纸、去皮、称盐','先放称量纸，再让天平归零，然后称取并转移五克盐。没有正确去皮，称量读数就不能直接代表盐的质量。','放好称量纸，先去皮，再称取并转移盐。','balance',[set('paper',true),act('tare'),act('weigh')],0,e=>e.state.data.tared&&Math.abs(e.state.data.salt-5)<.05,['[data-param="paper"]','[data-lab-action="tare"]','[data-lab-action="weigh"]']),
  step('平视量取水','量筒放在水平台面，视线与凹液面最低处水平。俯视或仰视会引入视差，不能用错误读数完成可靠配制。','视线角度调0度，读量筒液面后把水加入烧杯。','cylinder',[set('eyeAngle',0),act('read-water'),act('add-water')],0,e=>e.state.data.read&&Math.abs(e.state.data.water-45)<.2,['[data-param="eyeAngle"]','[data-lab-action="read-water"]','[data-lab-action="add-water"]']),
  step('充分溶解并标注浓度','用玻璃棒搅拌到盐充分溶解，再贴上浓度标签。分数由实际转入的盐和水决定，不能只看计划用量。','搅拌至充分溶解，再贴标签，核对50克和10%的实际读数。','rod',[act('stir'),act('label')],0,e=>e.state.data.dissolved&&e.state.data.labelled,['[data-lab-action="stir"]','[data-lab-action="label"]']),finish],
 metals:[
  step('建立可比的三组实验','选择三支试管，分别用镁、铁、铜。保持稀盐酸种类、用量和金属表面积一致，先打磨表面，减少氧化膜的干扰。','分别选择左、中、右试管，打磨金属，加入10毫升稀盐酸，再放入金属。','tube0',[...Array.from({length:3},(_,i)=>[set('sample',i),act('polish'),act('dose'),act('metal')]).flat()],0,e=>e.state.data.samples.every(m=>m.polished&&m.volume===10&&m.introduced),['[data-param="sample"]','[data-lab-action="polish"]','[data-lab-action="dose"]','[data-lab-action="metal"]']),
  step('比较气泡，而非只看名称','相近条件下，镁与稀盐酸反应较快，铁较慢，铜未见明显反应。不要把未见气泡误判成模型没有运行。','等待并比较三支试管，必要时加快时间；保持用量和表面积一致。','tube1',[],20,e=>e.state.evidence.Mg&&e.state.evidence.Fe&&e.state.evidence.Cu,['#timeScale']),
  step('取得导电性证据','选择打磨过的金属接入导电测试装置。灯泡亮起支持金属具有导电性；接触不良时，应先检查接触而不是否定金属导电。','选择已打磨的金属，点击测试导电性。','tester',[act('conductivity')],0,e=>e.state.evidence.physical,['[data-lab-action="conductivity"]']),
  step('清洗后更换试剂','为了考察铁与硫酸铜的反应，先清洗中间试管，避免旧试剂混入。再选硫酸铜、打磨铁片、加液和放入铁。','选择中间试管，清洗后再把溶液改为硫酸铜，重新加液和放入金属。','tube1',[set('sample',1),act('wash'),set('reagent','copper'),act('polish'),act('dose'),act('metal')],0,e=>e.state.data.samples[1].reagent==='copper'&&e.state.data.samples[1].introduced,['[data-param="sample"]','[data-lab-action="wash"]','[data-param="reagent"]']),
  step('观察铁置换铜','铁表面逐渐出现铜色固体，溶液颜色也发生变化。结合反应物和产物，说明铁能够从硫酸铜溶液中置换出铜。','等待析铜现象，记录颜色与表面变化，不要只记录“发生反应”。','tube1',[],20,e=>e.state.evidence.displacement,['#recordObservation']),finish],
 'acid-base':acidSteps(),neutralization:acidSteps(),
 water:[
  step('认识电极与导电条件','电解水需要低压直流电源和适当导电条件。纯水导电很弱，本探究使用指定的非氯化物条件；不能随意改加食盐。','选择非氯化物助导电条件，电压设6伏。','battery',[set('electrolyte','sulfate'),set('voltage',6)],0,e=>e.getParam('electrolyte')==='sulfate'&&e.getParam('voltage')>0,['[data-param="electrolyte"]','[data-param="voltage"]']),
  step('正负极分别连接','把电源正极接左电极，负极接右电极，形成有效电路。正负极互换时，气体出现的位置也会交换。','在连接器材中建立正极到左管、负极到右管的两条连接。','battery',[link('battery:+','left:in'),link('battery:-','right:in')],0,e=>Boolean(e.polarities()),['#connectionControls']),
  step('通电并比较体积','接通电源后，两侧出现气泡。负极产生氢气，正极产生氧气；在相同条件下，体积约为二比一。模型会压缩等待时间。','接通电源并等气体积累，可提高时间倍率，比较两侧体积和电极。','left',[act('power-toggle')],500,e=>{const d=e.state.data,p=e.polarities();return p&&Math.min(d.leftGas,d.rightGas)>1&&Math.abs((p.left==='-'?d.leftGas/d.rightGas:d.rightGas/d.leftGas)-2)<.05;},['[data-lab-action="power-toggle"]','#timeScale']),
  step('先断电，再检验','气体充分收集后先断开电源，再按实验要求检验。左侧为正极氧气，右侧为负极氢气。检验氢气必须遵守教师规定，不能在通电装置上自行点火。','先断电，再分别点击左右侧气体检验，阅读对应证据。','right',[act('power-toggle'),act('test-left'),act('test-right')],0,e=>!e.state.data.power&&e.state.evidence.left&&e.state.evidence.right,['[data-lab-action="power-toggle"]','[data-lab-action="test-left"]','[data-lab-action="test-right"]']),finish],
 combustion:[
  step('记录低温对照','先用木片和正常含氧条件，不开热源。虽然有可燃物和氧气，温度未到模型着火点时仍不能持续燃烧。','保持木片、氧气21%，不开热源，点击记录观察。','sample',[act('observe')],0,e=>Boolean(e.state.evidence.trials?.some(t=>t.material==='wood'&&t.oxygen>12&&t.temperature<300)),['#recordObservation']),
  step('三个条件同时满足','开启热源，把木片加热到模型着火温度以上，观察燃烧。本模型设置三百度作为比较阈值，不代表所有真实木材的固定物性。','环境温度设350度，开启热源，等燃烧出现后记录观察。','heater',[set('temperature',350),act('heat-toggle')],8,e=>e.state.evidence.burning,['[data-param="temperature"]','[data-lab-action="heat-toggle"]','#recordObservation']),
  step('只改变氧气条件','保持材料和高温条件，把氧气条件降低，观察燃烧停止。这个对照只改变氧气，便于分析停止燃烧的原因。','把氧气体积分数调为0，等待后记录观察。','oxygen',[act('observe'),set('oxygen',0)],1,e=>e.state.evidence.noOxygen,['[data-param="oxygen"]','#recordObservation']),
  step('只改变材料条件','恢复原含氧条件，把可燃木片换成石块。氧气与高温仍在，石块不作为燃料持续燃烧。比较时要明确其他条件相同。','先记录缺氧现象，再恢复氧气21%，材料换石块，记录对照。','sample',[act('observe'),set('oxygen',21),set('material','stone')],1,e=>e.state.evidence.noFuel,['[data-param="oxygen"]','[data-param="material"]','#recordObservation']),
  step('归纳燃烧条件','把低温、缺氧、不可燃材料三个对照与燃烧基准放在一起，可看出可燃物、氧气和达到着火点缺一不可。','记录当前石块对照，再检查证据；一次改变多个条件时，应重新设计比较。','sample',[act('observe')],0,e=>e.criteria().every(c=>c.met),['#recordObservation','#checkLab']),finish],
 air:[
  step('连接密闭体系','将两侧注射器与铜粉反应管连接，检查装置密闭性。以初始一百毫升空气为比较起点，防止外界空气混入。','建立两条导管连接，保持装置密闭，再检查气密性。','copperTube',[link('syringe:out','copperTube:in'),link('copperTube:out','receiver:in'),act('leak-test')],0,e=>e.state.data.sealChecked,['#connectionControls','[data-lab-action="leak-test"]']),
  step('用足量铜充分耗氧','加热足量铜，铜与氧气反应生成黑色氧化铜。装置温度升高时，气体也会膨胀，不能立刻用热态体积估算氧气含量。','铜设0.15克，打开热源，等待铜变黑、耗氧量趋于稳定。','heater',[set('copperMass',.15),act('heat-toggle')],100,e=>e.state.data.oxygenUsed>20.5,['[data-param="copperMass"]','[data-lab-action="heat-toggle"]','#timeScale']),
  step('关热源并冷却','关闭热源，等待装置回到接近原温度。只有在温度可比、装置不漏气、氧气充分消耗时，体积差才有合理含义。','关闭热源，等温度低于30度后再读数。','copperTube',[act('heat-toggle')],65,e=>!e.state.data.heater&&e.state.data.temperature<30,['[data-lab-action="heat-toggle"]','#timeScale']),
  step('读取体积并估算','冷却后读体积差，模型中减少的体积约占原空气的百分之二十一。若铜不足、装置漏气或未冷却，要先解释误差再下结论。','点击读取体积，核对初始100毫升与最终体积。','syringe',[act('read')],0,e=>e.state.evidence.read,['[data-lab-action="read"]']),finish],
 rust:[
  step('建立潮湿有氧样品','试管A中同时存在水和氧气，放入铁钉。把这组作为可能生锈的样品，再设计各少一个条件的对照。','选试管A，保持有水、有氧，点击放置铁钉。','tube0',[set('sample',0),act('prepare')],0,e=>e.state.data.samples[0].prepared&&e.state.data.samples[0].water&&e.state.data.samples[0].oxygen,['[data-param="sample"]','[data-lab-action="prepare"]']),
  step('建立干燥有氧对照','试管B保持有氧，但去掉水条件。这组与A只在水条件上不同，用来考察水对铁生锈的影响。','选试管B，关闭存在水、保持可接触氧气，再放置铁钉。','tube1',[set('sample',1),set('water',false),act('prepare')],0,e=>{const m=e.state.data.samples[1];return m.prepared&&!m.water&&m.oxygen;},['[data-param="sample"]','[data-param="water"]','[data-lab-action="prepare"]']),
  step('建立有水缺氧对照','试管C保留水，但排除氧气，再用油封维持条件。仅仅加一层油，并不会自动除去原来溶解在水中的氧气。','选试管C，关闭可接触氧气、保留水并加油封，然后放置铁钉。','tube2',[set('sample',2),set('oxygen',false),set('oil',true),act('prepare')],0,e=>{const m=e.state.data.samples[2];return m.prepared&&m.water&&!m.oxygen;},['[data-param="sample"]','[data-param="oxygen"]','[data-param="oil"]','[data-lab-action="prepare"]']),
  step('加速观察并比较','经过模型时间，潮湿有氧的A出现较明显锈蚀，另外两组保持较低趋势。这支持水和氧气共同促进锈蚀。显示的小时不预测真实生锈时间。','提高时间倍率等待差异，再点击记录观察，比较三组的条件与现象。','tube0',[],60,e=>e.state.evidence.comparison,['#timeScale','#recordObservation']),finish],
 conservation:[
  step('明确称量系统边界','反应瓶、反应物和包住瓶口的气球一起称量。气球可膨胀并保留气体，不能把产气装置用硬塞封死。','保留气球包住瓶口，取消封死硬塞，先读取初始质量。','balloon',[act('weigh')],0,e=>e.getParam('balloon')&&!e.getParam('rigidSeal')&&e.state.data.reading===100,['[data-param="balloon"]','[data-lab-action="weigh"]']),
  step('混合并保留生成气体','让碳酸钙与稀酸接触，生成气体进入气球。气球鼓起说明气体形成，但气体仍在称量系统之内。','点击混合反应物，观察气球并等反应充分。','flask',[act('react')],20,e=>e.state.data.extent>.9,['[data-lab-action="react"]','#timeScale']),
  step('比较封闭系统质量','再次称量，读数仍约一百克。反应前后总质量不变，与气体是否容易被肉眼看到无关。','读取系统质量，记录保留气体时的称量结果。','balance',[act('weigh')],0,e=>e.state.evidence.closed,['[data-lab-action="weigh"]','#recordObservation']),
  step('让气体离开，再称量','取下气球让气体离开称量范围。读数减小来自物质离开系统，并不表示化学反应不遵守质量守恒。','取下气球，等气体逸出后再读质量；在结论中说明称量范围。','balloon',[act('release')],20,e=>e.state.data.escaped>.2,['[data-lab-action="release"]','[data-lab-action="weigh"]']),
  step('比较开放系统读数','现在天平读数小于原值。把逸出气体的质量也计入，完整反应仍守恒。只报天平减轻而不说明系统边界，会造成错误推断。','再次读取质量，与保留气体时的记录比较。','balance',[act('weigh')],0,e=>e.state.evidence.open,['[data-lab-action="weigh"]']),finish]
};
const physicalTips={
 purify:['把漏斗拖到铁架台，再把接收烧杯拖到铁架台下方；滤纸放入漏斗，洗瓶用于漏斗，玻璃棒靠入漏斗。','把粗盐溶液烧杯拖到漏斗，缓慢倾倒两次；没有滤纸、未润湿或未引流都会导致本次失败。','将接收烧杯拖到蒸发皿，把澄清滤液转入。','把蒸发皿放到电热板上，玻璃棒放入蒸发皿；选电热板开启热源。','选电热板关闭热源；加热中移动器皿会使本次实验失败。'],
 oxygen:['把橡胶塞放到反应瓶；导气管先接反应瓶，再接集气瓶，选反应瓶检查气密性。','把集气瓶放到水槽，检查瓶口已倒置。','将二氧化锰和过氧化氢试剂分别用于反应瓶。','观察气泡和排水，等待收集量与比例足够，可调整计时倍率。','把带火星木条用于集气瓶检验。'],
 carbon:['塞紧反应瓶，连接导气管两端，再选反应瓶检查气密性。','集气瓶放在桌面正立，采用向上排空气收集。','把石灰石和稀盐酸分别加入反应瓶。','等待气体收集，注意集气比例和通路。','将集气瓶中的气体用于澄清石灰水检验。','把燃着木条用于集气瓶瓶口验满。'],
 solution:['选电子天平设置计划称盐5克，选量筒设置水量45毫升。','称量纸放到天平，选天平去皮；氯化钠放到天平称量，再把载有盐的称量纸用于烧杯，转入盐。','选量筒平视读数，再把量筒中的水转入烧杯。','把玻璃棒放入烧杯搅拌，选烧杯贴浓度标签。'],
 metals:['分别用砂纸打磨镁、铁、铜；给三支试管加入相同用量的稀盐酸，再分别放入三种金属。','等待并比较三支试管中的气泡。','把打磨过的金属用于导电测试装置。','洗瓶清洗中间试管，再加入硫酸铜溶液和打磨过的铁。','等待析铜和溶液颜色变化，记录真实现象。'],
 water:['把非氯化物助导电液加入电解液槽，选电源调节低电压。','将两支集气管放入电解液槽，连接电源正负极与不同电极。','选电源接通，等待气体生成，比较两侧体积。','选电源断电，再选左右集气管分别检验。'],
 combustion:['木片放到观察室，观察室放到热源；保持不加热，记录低温对照。','选热源设置温度并开启，观察燃烧后记录。','选供气器材把氧气条件调低，记录现象。','恢复含氧条件，把石块放入观察室，记录对照。','比较三个单变量对照并检查证据。'],
 air:['连接反应管与两侧注射器，选反应管检查气密性。','铜粉加入反应管，反应管放到热源，再选热源开启。','选热源关闭，等待冷却后再读数。','选气体注射器读取体积。'],
 rust:['清水加入试管A，放入铁钉A。','干燥条件试剂用于试管B，再放入铁钉B。','把除去氧气的水加入试管C，再加油封并放入铁钉C。','等待模型时间，比较三组锈蚀并记录。'],
 conservation:['反应瓶放到天平，气球套在瓶口，先选天平读取质量。','向反应瓶加入碳酸钙和稀酸，观察气球。','选天平再读一次质量。','选气球让气体离开称量系统。','再选天平读取质量并比较。']};
physicalTips['acid-base']=physicalTips.neutralization=['指示剂加入反应烧杯。','用滴管从稀碱瓶取液，再滴入反应烧杯，用干燥pH试纸测量。','从稀酸瓶取液滴入烧杯，再测pH，比较温度。','再加少量稀酸并测量，比较过量情况。'];
for(const[id,tips]of Object.entries(physicalTips))tips.forEach((tip,i)=>{GUIDES[id][i].tip=tip;GUIDES[id][i].targets=['#canvasHost','#combineSelected'];});
export function applyOperations(engine,operations){for(const op of operations){if(engine.workbench?.demoOperation(op))continue;if(op.type==='set')engine.setParam(op.key,op.value);else if(op.type==='act')engine.dispatch(op.id);else if(op.type==='link')engine.connect(op.a,op.b);else if(op.type==='select')engine.select(op.id);} }
