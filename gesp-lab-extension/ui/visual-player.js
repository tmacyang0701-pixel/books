import {pageVisual,visualHtml,visualContext} from './visuals.js';

export function createVisualPlayer() {
  const records=new Map(),root=document.getElementById('slideContent');
  let activeKey=null,timer=null;
  function pause(){clearInterval(timer);timer=null;}
  function render(){const entry=records.get(activeKey),panel=root.querySelector('.page-visual');if(entry&&panel)panel.outerHTML=visualHtml(entry.visual,entry.frame,{interactive:true,playing:Boolean(timer)});}
  function setPage(lesson,index){const key=lesson.id+':'+index;if(activeKey!==key)pause();activeKey=key;const visual=pageVisual(lesson.pages[index],lesson);if(!visual)return;if(!records.has(key))records.set(key,{visual,frame:0});render();}
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-visual]')?.dataset.visual,entry=records.get(activeKey);if(!action||!entry)return;
    if(action==='play'){
      if(timer)pause();
      else {if(entry.frame===entry.visual.frames.length-1)entry.frame=0;timer=setInterval(()=>{entry.frame++;if(entry.frame>=entry.visual.frames.length-1)pause();render();},1400);}
    }else {pause();entry.frame=Math.max(0,Math.min(entry.visual.frames.length-1,entry.frame+(action==='next'?1:-1)));}
    render();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();render();}});
  return {setPage,pause:()=>{pause();render();},context:(lessonId,index)=>{const entry=records.get(lessonId+':'+index);return entry?visualContext(entry.visual,entry.frame):'';}};
}
