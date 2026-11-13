// Size the lesson sidebars from their current sticky position to the visible bottom.
// The lesson header/history can move them down, so a fixed viewport subtraction
// would hide the composer until the outer page is scrolled.
export function fitLessonSidebars() {
  const panels=[...document.querySelectorAll('.player-layout > .page-chat')];
  const main=document.querySelector('.main-content');
  const player=document.getElementById('lessonPlayer');
  let frame=0;
  function fit(){
    frame=0;
    const viewport=window.visualViewport;
    const bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight);
    const scrollport=document.fullscreenElement||main;
    const bounds=scrollport.getBoundingClientRect();
    const visibleBottom=Math.min(bottom,bounds.bottom),visibleTop=Math.max(viewport?.offsetTop||0,bounds.top);
    for(const panel of panels){
      if(!panel.getClientRects().length)continue;
      if(getComputedStyle(panel).position==='fixed'){panel.style.removeProperty('--sidebar-height');continue;}
      const stickyEdge=visibleTop+(parseFloat(getComputedStyle(panel).top)||0);
      const maxHeight=Math.max(0,Math.floor(visibleBottom-stickyEdge-14));
      // At the grid's bottom sticky can be pushed upwards. Never grow the
      // sidebar from that negative offset: it must stay at most one viewport.
      const height=Math.max(0,Math.min(maxHeight,Math.floor(visibleBottom-Math.max(stickyEdge,panel.getBoundingClientRect().top)-14)));
      panel.style.setProperty('--sidebar-max-height',maxHeight+'px');
      const value=height+'px';
      if(panel.style.getPropertyValue('--sidebar-height')!==value)panel.style.setProperty('--sidebar-height',value);
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
  document.addEventListener('scroll',schedule,{capture:true,passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('fullscreenchange',schedule);
  document.addEventListener('app-layout-change',schedule);
  const observer=new ResizeObserver(schedule);
  for(const element of [main,player,document.querySelector('.lesson-directory-heading'),document.getElementById('lessonHistory')])if(element)observer.observe(element);
  const visibility=new MutationObserver(schedule);
  for(const element of [...panels,player,document.getElementById('view-lesson')])if(element)visibility.observe(element,{attributes:true,attributeFilter:['hidden','class']});
  schedule();
}
