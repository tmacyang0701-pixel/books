const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const node=(id,label,detail='')=>({id,label,detail});
const sequence=(title,labels)=>({type:'flow',title,nodes:labels.map((label,i)=>node('n'+i,label)),edges:labels.slice(1).map((_,i)=>({from:'n'+i,to:'n'+(i+1)})),frames:labels.map((label,i)=>({caption:`第 ${i+1} 步：${label}`,active:['n'+i]}))});

function goldbachVisual(page) {
  const kind=page.kind;
  if(kind==='知识'){
    const nodes=Array.from({length:31},(_,i)=>node('n'+i,String(i)));
    const frames=[{caption:'以 0～30 演示：0 和 1 不是素数。',active:[],marked:['n0','n1']}];
    const removed=new Set([0,1]);
    for(const p of [2,3,5]){for(let n=p*p;n<=30;n+=p)removed.add(n);frames.push({caption:`保留素数 ${p}，从 ${p} × ${p} 开始划去它的倍数。`,active:['n'+p],marked:[...removed].map(n=>'n'+n)});}
    frames.push({caption:'没有被划去的数就是素数；原题用同样的方法筛到 n。',active:nodes.filter((_,i)=>!removed.has(i)).map(n=>n.id),marked:[...removed].map(n=>'n'+n)});
    return {type:'grid',title:'埃氏筛：逐步划去合数',nodes,frames};
  }
  if(kind==='复杂度')return {type:'flow',title:'把两部分工作量合在一起',nodes:[node('a','筛出 0～n 的素数','O(n log log n)'),node('b','枚举 a = 2～n/2','O(n)'),node('c','得到总时间复杂度','O(n log log n)')],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],frames:[]};
  if(kind==='思路'||kind==='代码'||kind==='总结')return sequence('从输入到答案',[ '读入偶数 n','埃氏筛标记素数','枚举 a ≤ n/2','令 b = n − a','a、b 都是素数才计数','输出方案数' ]);
  if(kind==='易错')return {type:'array',title:'交换顺序不产生新方案',nodes:[node('a','3 + 7','保留'),node('b','7 + 3','与前一组相同'),node('c','5 + 5','只计一次')],frames:[{caption:'10 = 3 + 7，记录一个方案。',active:['a']},{caption:'7 + 3 只是交换顺序，所以用 a ≤ b 避免重复。',active:['a'],marked:['b']},{caption:'5 + 5 也成立，应包含 a = n/2，总计 2 种。',active:['a','c'],marked:['b']}]};
  const n=kind==='步骤'&&/26/.test(page.title+' '+(page.content||[]).join(' '))?26:10;
  const prime=x=>x>=2&&Array.from({length:Math.max(0,Math.floor(Math.sqrt(x))-1)},(_,i)=>i+2).every(d=>x%d!==0);
  const pairs=Array.from({length:n/2-1},(_,i)=>i+2);
  const nodes=pairs.map(a=>node('p'+a,`${a} + ${n-a}`,`= ${n}`));
  let count=0;const good=[],bad=[];
  const frames=[{caption:`目标：把 ${n} 拆成两个素数之和。只枚举较小的加数。`,active:[],marked:[]}];
  for(const a of pairs){const valid=prime(a)&&prime(n-a);(valid?good:bad).push('p'+a);if(valid)count++;frames.push({caption:`检查 ${a} + ${n-a}：${valid?'两数都是素数，计数 +1':'包含非素数，不计数'}。当前 ${count} 种。`,active:[...good],marked:[...bad]});}
  frames.push({caption:`枚举结束：${n} 一共有 ${count} 种不重复的方案。绿色为保留的方案。`,active:[...good],marked:[...bad]});
  return {type:'array',title:`把 ${n} 配成两数之和`,nodes,frames};
}

export function pageVisual(page,lesson={}) {
  if(page.visual?.nodes?.length)return page.visual;
  if(lesson.problem?.id==='gesp-2026-09-5-1'||/哥德巴赫/.test(lesson.problem?.title||''))return goldbachVisual(page);
  const trace=page.trace;
  if(trace?.headers?.length&&trace.rows?.length)return {type:'array',title:'观察状态如何变化',nodes:trace.headers.map((h,i)=>node('v'+i,String(h))),frames:trace.rows.map((row,index)=>({caption:`第 ${index+1} 步`,active:row.map((_,i)=>'v'+i),values:Object.fromEntries(row.map((value,i)=>['v'+i,String(value)]))}))};
  if(page.kind==='思路'&&page.content?.length)return sequence('解题过程',page.content.slice(0,6).map(v=>v.length>38?v.slice(0,37)+'…':v));
  return null;
}

export function visualContext(visual,index=0) {
  if(!visual)return '';
  const frame=visual.frames?.[index]||{};
  return JSON.stringify({title:visual.title,frame:index+1,caption:frame.caption||'',nodes:visual.nodes.map(n=>({label:n.label,value:frame.values?.[n.id]||n.detail||'',state:frame.marked?.includes(n.id)?'已排除':frame.active?.includes(n.id)?'当前关注/保留':'待检查'}))}).slice(0,6000);
}

export function visualHtml(visual,index=0,{interactive=false,playing=false}={}) {
  if(!visual?.nodes?.length)return '';
  const nodes=visual.nodes.slice(0,40),frames=visual.frames||[],frame=frames[index]||{},grid=visual.type==='grid';
  const columns=grid?Math.min(8,nodes.length):Math.min(3,nodes.length),width=760,gap=grid?10:24,padding=12;
  const boxWidth=(width-padding*2-gap*(columns-1))/columns,boxHeight=grid?56:92,rowGap=grid?12:36;
  const height=Math.ceil(nodes.length/columns)*(boxHeight+rowGap)-rowGap+padding*2;
  const positions=Object.fromEntries(nodes.map((n,i)=>[n.id,{x:padding+(i%columns)*(boxWidth+gap),y:padding+Math.floor(i/columns)*(boxHeight+rowGap)}]));
  const edges=(visual.edges||[]).map(edge=>{
    const a=positions[edge.from],b=positions[edge.to];if(!a||!b)return '';
    if(a.y===b.y){const right=b.x>a.x,sx=right?a.x+boxWidth:a.x,ex=right?b.x:b.x+boxWidth,y=a.y+boxHeight/2;return `<path d="M ${sx} ${y} L ${ex} ${y}" stroke="#99acd0" fill="none" stroke-width="2"/><path d="M ${ex} ${y} l ${right?-7:7} -4 v 8 z" fill="#99acd0"/>`;}
    const sx=a.x+boxWidth/2,sy=a.y+boxHeight,ex=b.x+boxWidth/2,ey=b.y,middle=sy+rowGap/2;
    return `<path d="M ${sx} ${sy} V ${middle} H ${ex} V ${ey}" stroke="#99acd0" fill="none" stroke-width="2"/><path d="M ${ex} ${ey} l -4 -7 h 8 z" fill="#99acd0"/>`;
  }).join('');
  const boxes=nodes.map(n=>{
    const {x,y}=positions[n.id],marked=frame.marked?.includes(n.id),active=frame.active?.includes(n.id);
    const fill=marked?'#fff0f2':active?'#e0f5ec':'#f4f7fd',stroke=marked?'#efb8c3':active?'#66b899':'#ccd9ee',color=marked?'#b34d63':active?'#207359':'#415c8e';
    const label=String(n.label),lines=grid?[label]:label.match(/.{1,15}/gu)?.slice(0,3)||[''];
    const detail=String(frame.values?.[n.id]??n.detail??'');
    return `<g><rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="${grid?10:12}" fill="${fill}" stroke="${stroke}" stroke-width="${active?2:1}"/>${lines.map((line,i)=>`<text x="${x+boxWidth/2}" y="${y+(grid?34:detail?27:36)+i*18}" fill="${color}" text-anchor="middle" font-size="${grid?19:14}" font-family="system-ui,Microsoft YaHei,sans-serif" ${marked&&grid?'text-decoration="line-through"':''}>${esc(line)}</text>`).join('')}${detail?`<text x="${x+boxWidth/2}" y="${y+boxHeight-14}" fill="${color}" text-anchor="middle" font-size="11" font-family="system-ui,Microsoft YaHei,sans-serif">${esc(detail.slice(0,34))}</text>`:''}</g>`;
  }).join('');
  return `<div class="page-visual"><div class="visual-heading"><h3>${esc(visual.title||'本页图解')}</h3><span>${frames.length>1?'步骤演示':'知识图解'}</span></div><svg class="visual-stage" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(visual.title||'本页图解')}">${edges}${boxes}</svg>${frame.caption?`<p class="visual-caption">${esc(frame.caption)}</p>`:''}${interactive&&frames.length>1?`<div class="visual-controls"><button type="button" data-visual="prev" ${index===0?'disabled':''}>← 上一步</button><button type="button" class="primary" data-visual="play">${playing?'暂停':'▶ 播放演示'}</button><button type="button" data-visual="next" ${index===frames.length-1?'disabled':''}>下一步 →</button><span>${index+1} / ${frames.length}</span></div>`:''}</div>`;
}
