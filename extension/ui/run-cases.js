export async function generateRunCase(api,source,currentInput,{onProgress=()=>{},isCurrent=()=>true,pause=()=>new Promise(resolve=>setTimeout(resolve,1000))}={}) {
  let job=await api('/api/run-cases',{lessonId:source.lessonId,pageIndex:source.pageIndex,currentInput});
  const deadline=Date.now()+240000;
  while(!['completed','failed'].includes(job.status)){
    if(!isCurrent())throw Error('已切换代码，未替换输入');
    if(Date.now()>deadline)throw Error('生成用例超时，原输入已保留');
    onProgress(job.message||'正在生成用例…');await pause();job=await api('/api/jobs/'+job.id);
  }
  if(job.status==='failed')throw Error(job.error?.message||job.message||'生成失败，原输入已保留');
  const value=job.result;
  if(value?.lessonId!==source.lessonId||value?.pageIndex!==source.pageIndex||typeof value.input!=='string'||!value.input.trim()||value.input.length>20000||typeof value.expected!=='string'||value.expected.length>4000||typeof value.explanation!=='string'||value.explanation.length>1000)throw Error('生成用例格式无效，原输入已保留');
  if(value.input.trim()===currentInput.trim())throw Error('生成了相同用例，原输入已保留，请重试');
  return value;
}
