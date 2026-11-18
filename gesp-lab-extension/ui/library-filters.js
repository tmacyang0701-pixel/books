export const isSourceTag = tag => typeof tag==='string' && /^来源\s*[：:]/.test(tag);

export function problemSource(problem) {
  const tag=problem.tags?.find(isSourceTag);
  const label=tag?.replace(/^来源\s*[：:]\s*/,'').trim();
  if(label)return label;
  if(problem.source?.organization?.trim())return problem.source.organization.trim();
  if(problem.kind==='past-paper')return 'CCF GESP';
  if(problem.kind==='generated')return 'AI 生成';
  if(problem.kind==='uploaded')return '我的上传';
  return '其他来源';
}

export function librarySources(problems) {
  return [...new Set(problems.map(problemSource))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
}

export function belongsToLibrary(problem,{level,group='gesp'}={}) {
  if(group==='bank')return problem.collection==='xiaohou-bank';
  if(group==='ungraded')return problem.collection==='xiaohou-bank'&&problem.level===null;
  if(['csp-j','csp-s'].includes(group))return problem.group===group;
  return problem.level===level;
}

export function libraryPage(problems,page=1,size=200) {
  const pages=Math.max(1,Math.ceil(problems.length/size));
  const current=Math.max(1,Math.min(pages,Number.isInteger(page)?page:1));
  return {items:problems.slice((current-1)*size,current*size),page:current,pages,total:problems.length};
}

export function filterLibrary(problems,{level,group='',source='',session='',tag='',query='',week='',contestGroup='',questionType='',origin='',difficulty=''}={}) {
  const search=query.trim().toLowerCase();
  return problems.filter(p=>belongsToLibrary(p,{level,group})&&(!source||problemSource(p)===source)&&
    (!origin||p.bankOrigin===origin)&&(!difficulty||p.platformDifficulty===difficulty)&&
    (p.occurrences?.length?(!session&&!week&&!contestGroup||p.occurrences.some(r=>(!session||r.periodLabel===session)&&(!week||String(r.week)===String(week))&&(!contestGroup||r.group===contestGroup))):(!week&&!contestGroup&&(!session||p.session===session)))&&
    (!questionType||(questionType==='theory'?p.kind==='theory':p.kind!=='theory'))&&
    (!tag||p.tags?.includes(tag)||p.knowledgePoints?.includes(tag))&&(!search||`${p.title} ${p.bankCode||''} ${(p.tags||[]).join(' ')}`.toLowerCase().includes(search)))
    .sort((a,b)=>String(b.session||'9999').localeCompare(String(a.session||'9999'))||a.number-b.number);
}
