import {escapeHtml as esc} from './core.js';

export async function unlockProblemKey(lesson) {
  if(lesson.problemId)return String(lesson.problemId);
  const p=lesson.problem||{};
  if(p.id?.trim())return p.id.trim();
  // Match the backend's canonical key, including legacy lessons without problemId.
  const text='{'+['constraints','description','input','level','output','title'].map(k=>JSON.stringify(k)+': '+JSON.stringify(p[k]??'')).join(', ')+'}';
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return 'custom-'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
}

export function createUnlockHistory() {
  let database;
  function db(){return database??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('codearena-unlock-history',1);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('unlocks',{keyPath:'id'});store.createIndex('problemKey','problemKey');};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{database=null;reject(Error('无法打开解锁记录存储'));};
    request.onblocked=()=>{database=null;reject(Error('请关闭旧页面后重试解锁记录'));};
  });}
  async function record(lesson,indices){
    const key=await unlockProblemKey(lesson),database=await db(),now=Date.now();
    await new Promise((resolve,reject)=>{
      const tx=database.transaction('unlocks','readwrite'),store=tx.objectStore('unlocks');
      for(const index of indices)store.add({id:crypto.randomUUID(),problemKey:key,lessonId:lesson.id,pageIndex:index,pageTitle:lesson.pages[index]?.title||'代码页',lessonTitle:lesson.title||'',unlockedAt:now});
      tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('解锁记录保存失败，请检查浏览器存储空间'));
    });
  }
  async function list(lesson){
    const key=await unlockProblemKey(lesson),database=await db();
    return new Promise((resolve,reject)=>{
      const request=database.transaction('unlocks').objectStore('unlocks').index('problemKey').getAll(key);
      request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.unlockedAt-a.unlockedAt));request.onerror=()=>reject(Error('读取解锁记录失败'));
    });
  }
  let dialog;
  async function show(lesson){
    if(!dialog){
      dialog=document.createElement('dialog');dialog.className='unlock-history-dialog';dialog.setAttribute('aria-labelledby','unlockHistoryTitle');
      dialog.innerHTML='<div class="dialog-heading"><h2 id="unlockHistoryTitle">代码解锁记录</h2><button class="icon-button" aria-label="关闭">×</button></div><p class="small muted">按原题保存在本机浏览器；重新生成课件后继续保留。只记录成功解锁，不保存密码。</p><div class="unlock-history-list" aria-live="polite"></div>';
      document.getElementById('lessonPlayer').append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();
    }
    const body=dialog.querySelector('.unlock-history-list');body.textContent='正在读取…';if(!dialog.open)dialog.showModal();
    try{
      const rows=await list(lesson);
      body.innerHTML=rows.length?`<p class="small">共 ${rows.length} 次成功解锁</p><ol>${rows.map(row=>`<li><time>${esc(new Date(row.unlockedAt).toLocaleString('zh-CN',{hour12:false}))}</time><strong>第 ${Number(row.pageIndex)+1} 页 · ${esc(row.pageTitle)}</strong><span>${esc(row.lessonTitle)}${row.lessonId!==lesson.id?' · 历史版本':''}</span></li>`).join('')}</ol>`:'<p class="muted">暂无记录。启用此功能后，成功解锁会记录在这里。</p>';
    }catch(error){body.textContent=error.message;}
  }
  return {record,list,show};
}
