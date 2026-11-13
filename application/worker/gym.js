export function createGymAPI({completion,configured,json,readJSON,sign,openSigned,PublicError,sample}){
 const kinds=['digits','words','switch'];
 const names={digits:'倒序数字',words:'词语记忆',switch:'规则切换'};
 function config(kind,level){
  if(!kinds.includes(kind)||!Number.isInteger(level)||level<1||level>10)throw new PublicError('请选择有效的训练和 1–10 级难度。');
  const base={kind,level,name:names[kind]};
  if(kind==='digits')return {...base,span:level+2,rounds:3,flashMs:1000-60*level,gapMs:180,answerSeconds:Math.max(14,30-level),total:3*(level+2)};
  if(kind==='words')return {...base,count:level+3,studySeconds:14-Math.floor(level*.6),answerSeconds:55-level*2,total:level+3};
  return {...base,count:8+level*2,rules:level<=3?['parity']:level<=6?['parity','magnitude']:['parity','magnitude','multiple'],max:level<=3?9:level<=6?39:99,threshold:level<=3?5:level<=6?20:50,responseMs:8000-level*500,total:8+level*2};
 }
 function parse(text){try{return JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));}catch{throw new Error('没有输出有效 JSON');}}
 function validate(data,cfg){
  if(!data||typeof data!=='object')throw new Error('缺少题目对象');
  if(cfg.kind==='digits'){
   if(!Array.isArray(data.sequences)||data.sequences.length!==3||data.sequences.some(s=>typeof s!=='string'||!new RegExp('^[0-9]{'+cfg.span+'}$').test(s)||new Set(s).size<3)||new Set(data.sequences).size!==3)throw new Error(`sequences 必须是 3 个互不相同的 ${cfg.span} 位数字字符串，每串至少含3种数字`);
   return {sequences:data.sequences};
  }
  if(cfg.kind==='words'){
   const validWord=x=>typeof x==='string'&&/^[\p{Script=Han}]{2,4}$/u.test(x);
   if(!Array.isArray(data.targets)||!Array.isArray(data.distractors)||data.targets.length!==cfg.count||data.distractors.length!==cfg.count||![...data.targets,...data.distractors].every(validWord)||new Set([...data.targets,...data.distractors]).size!==cfg.count*2)throw new Error(`targets 和 distractors 均须包含 ${cfg.count} 个常见的2–4字中文名词，所有词语不重复`);
   return {targets:data.targets,distractors:data.distractors};
  }
  if(!Array.isArray(data.trials)||data.trials.length!==cfg.count||data.trials.some(t=>!t||!Number.isInteger(t.value)||t.value<1||t.value>cfg.max||!cfg.rules.includes(t.rule)))throw new Error(`trials 需要 ${cfg.count} 项，value 为 1–${cfg.max} 的整数，rule 限定 ${cfg.rules.join('/')}`);
  const switches=data.trials.filter((t,i)=>i&&t.rule!==data.trials[i-1].rule).length;
  if(cfg.rules.some(r=>!data.trials.some(t=>t.rule===r))||cfg.rules.length>1&&switches<Math.floor(cfg.count*(cfg.level>=7?.65:.45)))throw new Error('规则种类或切换次数不足，请在允许规则之间频繁切换');
  return {trials:data.trials.map(t=>({value:t.value,rule:t.rule}))};
 }
 function prompt(cfg){
  const shared='你是中文认知练习出题员。只输出 JSON，不输出分析、答案、评分或额外文字。严格遵守给定长度和范围，生成新颖但清晰的练习材料，不宣称医学效果。';
  const task=cfg.kind==='digits'?`为倒序数字训练生成恰好3串随机数字，每串恰好${cfg.span}位，每串至少含3种不同数字，避免简单递增/递减或重复周期。格式 {"sequences":["...","...","..."]}。保留前导0。`:
   cfg.kind==='words'?`为词语记忆训练生成${cfg.count}个学习词和${cfg.count}个干扰词，所有词均为2–4个汉字的日常具体名词，不得重复，不用生僻词、人名或抽象词。难度${cfg.level}/10。${cfg.level>=6?'学习词与干扰词尽量来自相近类别，增加区分难度。':'词语尽量来自不同生活类别，便于起步。'}格式 {"targets":["苹果",...],"distractors":["雨伞",...]}。`:
   `为规则切换训练生成${cfg.count}题，数值是1–${cfg.max}整数，每题rule只允许${cfg.rules.join('、')}，每种允许规则至少出现一次。${cfg.rules.length>1?`至少${Math.floor(cfg.count*(cfg.level>=7?.65:.45))}次相邻规则切换，避免长时间不换规则。`:''}parity表示判断单/双数，magnitude表示判断大于${cfg.threshold}或不大于${cfg.threshold}，multiple表示是否为3的倍数。数值和两类答案尽量平衡。格式 {"trials":[{"value":7,"rule":"parity"},...]}。`;
  return [{role:'system',content:shared},{role:'user',content:task}];
 }
 const ruleAnswer=(trial,cfg)=>trial.rule==='parity'?(trial.value%2?0:1):trial.rule==='magnitude'?(trial.value>cfg.threshold?0:1):(trial.value%3===0?0:1);
 const labels=(rule,cfg)=>rule==='parity'?['单数','双数']:rule==='magnitude'?[`大于 ${cfg.threshold}`,`不大于 ${cfg.threshold}`]:['3 的倍数','非 3 的倍数'];
 function grade(session,responses){
  const {cfg,data}=session;let rows=[],correct=0,incorrect=0,unanswered=0,score=0;
  if(cfg.kind==='digits'){
   if(!Array.isArray(responses)||responses.length!==3||responses.some(s=>typeof s!=='string'||!new RegExp('^[0-9]{0,'+cfg.span+'}$').test(s)))throw new PublicError('数字回答格式无效。');
   rows=data.sequences.map((s,i)=>{const expected=[...s].reverse().join(''),heard=responses[i];const matched=[...expected].filter((n,j)=>heard[j]===n).length;correct+=matched;incorrect+=heard.length-matched;unanswered+=cfg.span-heard.length;return {label:`第 ${i+1} 轮`,prompt:s,expected,heard:heard||'未作答',detail:`${matched} / ${cfg.span} 位正确`,correct:matched===cfg.span};});
   score=Math.round(correct/cfg.total*100);
  }else if(cfg.kind==='words'){
   const choices=[...data.targets,...data.distractors];
   if(!Array.isArray(responses)||responses.length>cfg.count||new Set(responses).size!==responses.length||responses.some(s=>!choices.includes(s)))throw new PublicError('词语选择无效或超过本轮记忆词数。');
   correct=responses.filter(s=>data.targets.includes(s)).length;incorrect=responses.length-correct;unanswered=cfg.count-correct;score=Math.max(0,Math.round((correct-incorrect)/cfg.total*100));
   rows=[...data.targets.map(s=>({label:'学习词',prompt:s,expected:'应选',heard:responses.includes(s)?'已选':'未选',detail:responses.includes(s)?'✓ 记住了':'— 遗漏',correct:responses.includes(s)})),...responses.filter(s=>data.distractors.includes(s)).map(s=>({label:'干扰词',prompt:s,expected:'不应选',heard:'已选',detail:'× 误选',correct:false}))];
  }else{
   if(!Array.isArray(responses)||responses.length!==cfg.count||responses.some(r=>!r||![0,1,null].includes(r.answer)||!Number.isFinite(r.ms)||r.ms<0||r.ms>cfg.responseMs+200))throw new PublicError('规则切换回答格式或答题时长无效。');
   rows=data.trials.map((trial,i)=>{const options=labels(trial.rule,cfg),r=responses[i],answer=r.ms>cfg.responseMs?null:r.answer,ok=answer===ruleAnswer(trial,cfg);if(answer===null)unanswered++;else if(ok)correct++;else incorrect++;return {label:`第 ${i+1} 题`,prompt:String(trial.value),expected:options[ruleAnswer(trial,cfg)],heard:answer===null?'超时 / 未作答':options[answer],detail:answer===null?'— 未作答':ok?'✓ 正确':'× 错误',correct:ok};});
   score=Math.round(correct/cfg.total*100);
  }
  const suggestedLevel=score>=80?Math.min(10,cfg.level+1):score<50?Math.max(1,cfg.level-1):cfg.level;
  return {kind:cfg.kind,level:cfg.level,name:cfg.name,total:cfg.total,correct,incorrect,unanswered,score,rows,suggestedLevel,feedback:score>=80?cfg.level===10?'本轮完成得很稳，可以保持 10 级继续练习。':`本轮达到 80 分，可以试试 ${suggestedLevel} 级。`:score<50?`先在 ${suggestedLevel} 级找回节奏，熟悉后再增加难度。`:'继续在当前级别练习，把准确率稳定下来。'};
 }
 return async function handleGym(request,env){
  const url=new URL(request.url);
  try{
   if(request.method!=='POST')return json({error:'仅支持 POST 请求。'},405);
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw new PublicError('不允许跨站请求。',403);
   configured(env);if(Number(request.headers.get('content-length'))>50000)throw new PublicError('训练请求过大。',413);
   const body=await readJSON(request);
   if(url.pathname==='/api/gym/challenge'){
    const cfg=config(body.kind,body.level),messages=prompt(cfg),model=env.ALIBABA_BAILIAN_MODEL||'qwen3.7-plus';let data;
    for(let attempt=0;attempt<2;attempt++){
     const text=await completion(env,{model,messages,stream:true,thinking_budget:1024,max_tokens:5000});
     try{data=validate(parse(text),cfg);break;}catch(error){if(attempt)throw new PublicError('模型生成的题目不符合本级要求，请重试出题。',502);messages.push({role:'assistant',content:text.slice(0,12000)},{role:'user',content:`请修正 JSON：${error.message}。只输出修正后的完整 JSON。`});}
    }
    const id=crypto.randomUUID(),payload={v:1,kind:'gym',id,cfg,data,expires:Date.now()+60*60*1000};
    return json({id,cfg,model,token:await sign(payload,env.ALIBABA_BAILIAN_API_KEY),...data,...(cfg.kind==='words'?{choices:sample([...data.targets,...data.distractors])}:{})});
   }
   if(url.pathname==='/api/gym/grade'){
    let session;try{session=await openSigned(body.token,env.ALIBABA_BAILIAN_API_KEY);if(session.kind!=='gym'||session.v!==1)throw 0;const cfg=config(session.cfg.kind,session.cfg.level);validate(session.data,cfg);session.cfg=cfg;}catch{throw new PublicError('本轮训练已过期或无效，请重新出题。');}
    return json({id:session.id,...grade(session,body.responses)});
   }
   return json({error:'未找到训练接口。'},404);
  }catch(error){return json({error:error instanceof PublicError?error.message:'暂时无法完成训练，请稍后重试。'},error instanceof PublicError?error.status:500);}
 };
}
