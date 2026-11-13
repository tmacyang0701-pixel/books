(()=>{
 const key='number-garden-layout-v1';let preferences={sidebar:false,topbar:false};
 try{const saved=JSON.parse(localStorage.getItem(key)||'{}');preferences={sidebar:saved.sidebar===true,topbar:saved.topbar===true};}catch{}
 function apply(){for(const part of ['sidebar','topbar']){const collapsed=preferences[part],label=part==='sidebar'?'左侧菜单':'顶部栏',button=document.getElementById(part+'Toggle');document.body.classList.toggle(part+'-collapsed',collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',(collapsed?'展开':'收起')+label);button.title=(collapsed?'展开':'收起')+label;button.querySelector('span').textContent=part==='sidebar'?(collapsed?'☰':'◧'):(collapsed?'⌄':'⌃');}document.dispatchEvent(new Event('layout-change'));}
 for(const part of ['sidebar','topbar'])document.getElementById(part+'Toggle').onclick=()=>{preferences[part]=!preferences[part];apply();try{localStorage.setItem(key,JSON.stringify(preferences));}catch{}};
 apply();
})();
