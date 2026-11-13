import { createTutorApi, normalizeServiceUrl, sharedServiceUrl } from './tutor-api.js';

export function sendNative(payload) {
  return new Promise((resolve,reject)=>{
    if(!globalThis.chrome?.runtime?.sendNativeMessage){reject(Error('请在 Chrome 物理实验室扩展中点击启动；网页预览可先运行 GESP 的 start-learning.bat。'));return;}
    chrome.runtime.sendNativeMessage('com.codearena.cpp_judge',payload,response=>{
      const error=chrome.runtime.lastError;
      if(error){reject(Error('请先运行 GESP 目录下的 enable-page-start.bat，完成后重新加载物理扩展，即可从这里启动共用后台。'));return;}
      if(!response||response.error){reject(Error(response?.error||'本地组件没有响应。'));return;}
      resolve(response);
    });
  });
}

export async function startSharedService({native=sendNative,getHealth,onEndpoint=()=>{},onProgress=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxPolls=90}) {
  const capability=await native({mode:'capabilities'});
  if(!capability.capabilities?.includes('learningServiceControl'))throw Error('请运行 GESP 目录下的 enable-page-start.bat 更新本地组件。');
  const job=await native({mode:'learning_service_start',restart:true});
  if(job.error)throw Error(job.error);
  if(!/^[a-f0-9]{32}$/.test(job.id||''))throw Error('后台启动任务无效，请更新本地组件。');
  for(let index=0;index<maxPolls;index++){
    const status=await native({mode:'learning_service_status',jobId:job.id});
    if(status.error||status.status==='failed')throw Error(status.error||status.message||'后台启动失败，请重试。');
    if(status.status==='completed'){
      const latest=await native({mode:'capabilities'});
      const endpoint=normalizeServiceUrl(latest.serviceUrl);
      onEndpoint(endpoint);
      const health=await getHealth(endpoint);
      if(health.service!=='codearena-learning'||health.physicsSchema!==1||!health.chapterChat)throw Error('物理问答接口尚未就绪，请更新 GESP 后台后重试。');
      onProgress(health.configured?'共享后台已就绪':'后台已启动，请在 GESP 中配置模型密钥');return health;
    }
    onProgress(index<2?'正在启动后台…':'正在检查并更新后台…');await sleep(1000);
  }
  throw Error('后台仍在启动，可稍后重试；启动日志位于 GESP 的 .local/service-start。');
}

export function mountServiceControl({onReady,notify}) {
  let starting=null;
  const button=document.querySelector('#start-shared-service');
  const remember=url=>{try{localStorage.setItem('physics-shared-service',normalizeServiceUrl(url));}catch{}};
  const status=text=>{button.textContent=text;document.querySelectorAll('[data-service-start]').forEach(b=>b.disabled=Boolean(starting));};
  function showError(text){
    const dialog=document.querySelector('#shared-service-dialog');dialog.querySelector('p').textContent=text;
    if(!dialog.open)dialog.showModal();
  }
  async function start(){
    if(starting)return starting;
    starting=(async()=>{
      try{
        const health=await startSharedService({onEndpoint:remember,onProgress:status,getHealth:url=>createTutorApi(url)('/health')});
        onReady();notify(health.configured?'共享后台已启动，可以继续提问。':'后台已启动，请在 GESP 中配置模型密钥。');
      }catch(error){showError(error.message);}
      finally{starting=null;status('启动／更新后台');}
    })();
    status('正在启动后台…');return starting;
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-service-start]'))start();});
  document.querySelector('#shared-service-dialog button').onclick=()=>document.querySelector('#shared-service-dialog').close();
  // A moved/shared GESP installation may choose another port; use its reported endpoint.
  if(globalThis.chrome?.runtime?.sendNativeMessage)sendNative({mode:'capabilities'}).then(info=>{
    if(!info.serviceUrl)return;const next=normalizeServiceUrl(info.serviceUrl);
    if(next!==sharedServiceUrl()){remember(next);onReady();}
  }).catch(()=>{});
}
