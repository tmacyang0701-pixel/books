(()=>{
 const tabs=[...document.querySelectorAll('.training-tab')],locks=new Set();let current='numbers';
 const keyFor=tab=>tab.dataset.training||'numbers';
 function lock(owner,value){if(value)locks.add(owner);else locks.delete(owner);for(const tab of tabs)tab.disabled=locks.size>0;}
 function go(key){
  if(locks.size||!tabs.some(t=>keyFor(t)===key))return false;
  if(key!=='numbers')document.dispatchEvent(new Event('training-switch'));
  document.getElementById('numberPanel').hidden=key!=='numbers';document.getElementById('stroopPanel').hidden=key!=='stroop';document.getElementById('gymPanel').hidden=!['digits','words','switch'].includes(key);document.getElementById('programmingPanel').hidden=key!=='programming';
  for(const tab of tabs){const active=keyFor(tab)===key;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active));if(active&&tab.parentElement.scrollWidth>tab.parentElement.clientWidth){const parent=tab.parentElement,box=parent.getBoundingClientRect(),button=tab.getBoundingClientRect();parent.scrollBy({left:button.left-box.left-(parent.clientWidth-button.width)/2,behavior:'smooth'});}}
  const previous=current;current=key;const hash=key==='numbers'?'':'#'+key;if(location.hash!==hash)history.replaceState(null,'',location.pathname+location.search+hash);
  document.dispatchEvent(new CustomEvent('training-navigate',{detail:{key,previous}}));return true;
 }
 window.TrainingNavigation={go,lock,current:()=>current};tabs.forEach(tab=>tab.onclick=()=>go(keyFor(tab)));
 window.addEventListener('hashchange',()=>{const key=location.hash.slice(1)||'numbers';if(!go(key)&&locks.size){const hash=current==='numbers'?'':'#'+current;history.replaceState(null,'',location.pathname+location.search+hash);}});
})();
