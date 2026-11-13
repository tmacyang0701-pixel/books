const storageKey='ca-layout-v1';
let preferences={sidebarCollapsed:true,headerCollapsed:true,outlineCollapsed:false,problemCollapsed:false};
try{
  const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
  preferences={
    sidebarCollapsed:typeof saved?.sidebarCollapsed==='boolean'?saved.sidebarCollapsed:true,
    headerCollapsed:typeof saved?.headerCollapsed==='boolean'?saved.headerCollapsed:true,
    outlineCollapsed:typeof saved?.outlineCollapsed==='boolean'?saved.outlineCollapsed:false,
    problemCollapsed:typeof saved?.problemCollapsed==='boolean'?saved.problemCollapsed:false,
  };
}catch{}

const panels=[
  {key:'sidebarCollapsed',className:'sidebar-collapsed',panel:'appNavigation',button:'sidebarToggle',label:'左侧菜单'},
  {key:'headerCollapsed',className:'header-collapsed',panel:'appHeader',button:'headerToggle',label:'顶部栏'},
  {key:'outlineCollapsed',className:'outline-collapsed',panel:'slideOutline',button:'outlineToggle',label:'课件目录'},
  {key:'problemCollapsed',className:'problem-collapsed',panel:'workspaceProblemPanel',button:'workspaceProblemToggle',extraButtons:['workspaceProblemCollapse'],label:'题目面板'},
];
const headerTools=document.querySelector('.header-tools');
const headerMenu=document.getElementById('headerToolsMenu');
const headerStatus=document.getElementById('serviceStatus');

function updateConnectionState(){
  const message=headerStatus.textContent;
  const ready=headerStatus.classList.contains('ready')&&message.includes('本地服务已连接');
  const label=ready?'已连接':message.includes('待配置')?'待配置':message.includes('需要更新')?'待更新':/未启动|未连接|失败/.test(message)?'未连接':/连接中/.test(message)?'连接中':'启动中';
  headerMenu.dataset.state=ready?'ready':label==='未连接'?'offline':'pending';
  document.getElementById('headerConnectionLabel').textContent=label;
  headerMenu.querySelector('summary').title=message+' · 点击打开服务菜单';
  headerMenu.querySelector('summary').setAttribute('aria-label','讲解服务'+label+'，打开服务菜单');
}
new MutationObserver(updateConnectionState).observe(headerStatus,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
updateConnectionState();

function applyLayout(){
  const destination=preferences.headerCollapsed?headerMenu.querySelector('.header-tools-panel'):document.getElementById('appHeader');
  if(headerTools.parentElement!==destination)destination.append(headerTools);
  headerMenu.hidden=!preferences.headerCollapsed;
  if(headerMenu.hidden)headerMenu.open=false;
  for(const item of panels){
    const collapsed=preferences[item.key];
    document.body.classList.toggle(item.className,collapsed);
    document.getElementById(item.panel).hidden=collapsed;
    for(const id of [item.button,...(item.extraButtons||[])]){
      const button=document.getElementById(id);
      button.setAttribute('aria-expanded',String(!collapsed));
      button.setAttribute('aria-label',(collapsed?'展开':'收起')+item.label);
      button.title=(collapsed?'展开':'收起')+item.label;
    }
  }
  document.getElementById('workspaceProblemToggle').textContent=preferences.problemCollapsed?'展开题面':'题面';
  document.dispatchEvent(new Event('app-layout-change'));
}

for(const item of panels){
  for(const id of [item.button,...(item.extraButtons||[])])document.getElementById(id).addEventListener('click',()=>{
    const focusHidden=document.getElementById(item.panel).contains(document.activeElement);
    preferences[item.key]=!preferences[item.key];
    applyLayout();
    if(preferences[item.key]&&focusHidden)document.getElementById(item.button).focus();
    try{localStorage.setItem(storageKey,JSON.stringify(preferences));}catch{}
  });
}
applyLayout();
for(const menu of [document.getElementById('workspaceMenu'),document.getElementById('lessonActionsMenu'),headerMenu]){
  menu.addEventListener('click',event=>{if(event.target.closest('button'))menu.open=false;});
  document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});
}
const lessonChatHandle=document.getElementById('lessonChatHandle');
const chatPanel=document.getElementById('pageChat');
const runPanel=document.getElementById('lessonRunPanel');
function syncLessonSidebar(){
  const open=!chatPanel.hidden||!runPanel.hidden;
  chatPanel.closest('.player-layout').classList.toggle('chat-collapsed',!open);
  lessonChatHandle.hidden=open;
}
const lessonSidebarObserver=new MutationObserver(syncLessonSidebar);
for(const panel of [chatPanel,runPanel])lessonSidebarObserver.observe(panel,{attributes:true,attributeFilter:['hidden']});
lessonChatHandle.addEventListener('click',()=>document.getElementById('togglePageChat').click());
syncLessonSidebar();
const narrationPanel=document.getElementById('narrationPanel');
const narrationToggle=document.getElementById('toggleNarration');
function setNarrationOpen(open){
  narrationPanel.hidden=!open;
  narrationToggle.setAttribute('aria-expanded',String(open));
}
narrationToggle.addEventListener('click',()=>setNarrationOpen(narrationPanel.hidden));
document.getElementById('closeNarration').addEventListener('click',()=>{setNarrationOpen(false);narrationToggle.focus();});
document.getElementById('lessonPlayer').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!narrationPanel.hidden){setNarrationOpen(false);narrationToggle.focus();event.stopPropagation();}
});
