import { createTutorApi, normalizeServiceUrl, sharedServiceUrl } from './tutor-api.js';

export function sendNative(payload) {
  return new Promise((resolve,reject)=>{
    if(!globalThis.chrome?.runtime?.sendNativeMessage){reject(Error('当前是网页模式。请双击 physics-lab-extension 目录下的 start-learning.bat（与 manifest.json 放在一起）；它会启动同级 GESP 的共享后台。'));return;}
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
  let starting=null,statusVersion=0;
  const button=document.querySelector('#start-shared-service'),menu=document.querySelector('#shared-service-menu');
  const label=document.querySelector('#shared-connection-label'),serviceStatus=document.querySelector('#shared-service-status'),detail=document.querySelector('#shared-service-detail');
  const extensionPage=globalThis.location?.protocol==='chrome-extension:';
  const idleLabel=extensionPage?'启动／更新后台':'启动说明';
  button.textContent=idleLabel;
  const remember=url=>{try{localStorage.setItem('physics-shared-service',normalizeServiceUrl(url));}catch{}};
  function renderHealth(health,error){
    const outdated=health&&(health.service!=='codearena-learning'||health.physicsSchema!==1||!health.chapterChat);
    const ready=health?.configured&&!outdated;
    menu.dataset.state=ready?'ready':health?'attention':'offline';
    label.textContent=ready?'已连接':outdated?'需更新':health?'待配置':'未连接';
    serviceStatus.textContent=ready?health.model+' · 本地服务已连接':outdated?'后台需要更新':health?'本地服务已连接 · 待配置密钥':'讲解服务未连接';
    detail.textContent=error?.message||('后台地址：'+sharedServiceUrl()+(outdated?'\n请启动／更新后台。':!health?.configured?'\n请在 GESP 中配置模型密钥。':''));
  }
  async function syncEndpoint(){
    if(!extensionPage||!globalThis.chrome?.runtime?.sendNativeMessage)return;
    try{const info=await sendNative({mode:'capabilities'});if(info.serviceUrl){const next=normalizeServiceUrl(info.serviceUrl);if(next!==sharedServiceUrl()){remember(next);onReady();}}}catch{}
  }
  async function checkConnection(){
    if(starting)return;
    const version=++statusVersion;
    menu.dataset.state='checking';label.textContent='连接中';serviceStatus.textContent='正在检测本地服务…';
    try{await syncEndpoint();const health=await createTutorApi(sharedServiceUrl())('/health');if(version===statusVersion)renderHealth(health);return health;}
    catch(error){if(version===statusVersion)renderHealth(null,error);}
  }
  const progress=text=>{button.textContent=text;label.textContent='连接中';serviceStatus.textContent=text;menu.dataset.state='checking';document.querySelectorAll('[data-service-start]').forEach(b=>b.disabled=Boolean(starting));};
  function showError(text){
    const dialog=document.querySelector('#shared-service-dialog');dialog.querySelector('p').textContent=text;
    if(!dialog.open)dialog.showModal();
  }
  async function start(){
    if(!extensionPage){menu.open=false;showError('网页模式请双击 physics-lab-extension 目录下的 start-learning.bat（与 manifest.json 放在一起）。更新后台时运行同目录的 restart-learning.bat；两个入口共用同级 GESP 后台。完成后在连接菜单中点击“重新检测”。');return;}
    if(starting)return starting;
    ++statusVersion;menu.open=false;
    starting=(async()=>{
      try{
        const health=await startSharedService({onEndpoint:remember,onProgress:progress,getHealth:url=>createTutorApi(url)('/health')});
        renderHealth(health);onReady();notify(health.configured?'共享后台已启动，可以继续提问。':'后台已连接，请在 GESP 中配置模型密钥。');
      }catch(error){renderHealth(null,error);showError(error.message);}
      finally{starting=null;button.textContent=idleLabel;document.querySelectorAll('[data-service-start]').forEach(b=>b.disabled=false);}
    })();
    progress('正在启动后台…');return starting;
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-service-start]'))start();
    else if(!menu.contains(event.target))menu.open=false;
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus({preventScroll:true});}});
  document.querySelector('#shared-service-dialog button').onclick=()=>document.querySelector('#shared-service-dialog').close();
  document.querySelector('#check-shared-service').onclick=checkConnection;
  menu.addEventListener('toggle',()=>{if(menu.open)checkConnection();});
  window.addEventListener('focus',()=>{if(!document.hidden)checkConnection();});
  checkConnection();
}
