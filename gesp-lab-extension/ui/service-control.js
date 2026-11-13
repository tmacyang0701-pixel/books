export async function startLearningService({sendNative,getHealth,restart=true,onProgress=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxPolls=90}) {
  let capability;
  try {capability=await sendNative({mode:'capabilities'});}
  catch {throw Error('本地组件尚未安装或未连接。请先运行一次 install-all.bat，注册完成后即可从页面启动。');}
  if(!capability.capabilities?.includes('learningServiceControl'))throw Error('本地组件仍是旧版。请双击一次 enable-page-start.bat 更新注册，以后可直接在页面启动后台。');
  const job=await sendNative({mode:'learning_service_start',restart});
  if(job.error)throw Error(job.error);
  if(!/^[a-f0-9]{32}$/.test(job.id||''))throw Error('本地启动任务返回异常，请重新安装本地组件。');
  for(let i=0;i<maxPolls;i++){
    const status=await sendNative({mode:'learning_service_status',jobId:job.id});
    if(status.error)throw Error(status.error);
    if(status.status==='failed')throw Error(status.message||'后台启动失败，请打开服务设置查看详情。');
    if(status.status==='completed'){
      const health=await getHealth();
      if(health.service!=='codearena-learning'||health.version<12||!health.capabilities?.includes('topicSyntaxLabs')||!health.capabilities?.includes('knowledgeTopics')||!health.capabilities?.includes('codeAnalysis')||!health.capabilities?.includes('runCases')||!(health.runCaseSchema>=2))throw Error('启动结束，但新版学习服务尚未就绪，请查看服务设置。');
      onProgress('后台已就绪');return health;
    }
    onProgress(i<2?'正在启动后台…':'正在检查并更新后台…');
    await sleep(1000);
  }
  throw Error('后台启动仍未完成，请稍后点击“重新检测”；详细日志位于 .local/service-start。');
}
