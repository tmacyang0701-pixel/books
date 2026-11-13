export const MAX_IMAGES=3;
export const MAX_IMAGE_BYTES=2*1024*1024;
const IMAGE_URL=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export function validAttachment(value) {
  return typeof value?.dataUrl==='string' && value.dataUrl.length<=Math.ceil(MAX_IMAGE_BYTES/3)*4+32 && IMAGE_URL.test(value.dataUrl);
}
export function loadImage(url) {
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('图片无法读取，请选择 PNG、JPG 或 WebP 图片'));img.src=url;});
}
export function canvasAttachment(canvas,name='课件截图',source='screenshot') {
  const scale=Math.min(1,2000/Math.max(canvas.width,canvas.height));
  const output=document.createElement('canvas');output.width=Math.max(1,Math.round(canvas.width*scale));output.height=Math.max(1,Math.round(canvas.height*scale));
  const ctx=output.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0,output.width,output.height);
  let dataUrl=output.toDataURL('image/png');
  if(dataUrl.length>MAX_IMAGE_BYTES*4/3)dataUrl=output.toDataURL('image/jpeg',0.85);
  const result={id:crypto.randomUUID(),name:String(name).slice(0,100),source,width:output.width,height:output.height,dataUrl};
  if(!validAttachment(result))throw Error('图片仍然太大，请框选较小的区域');
  return result;
}
export async function fileAttachment(file) {
  if(!file || !['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPG 或 WebP 图片');
  if(file.size>8*1024*1024)throw Error('原始图片不能超过 8 MiB');
  const url=URL.createObjectURL(file);
  try {
    const img=await loadImage(url);
    if(img.naturalWidth*img.naturalHeight>40000000)throw Error('图片尺寸太大，请先缩小或截取局部');
    const scale=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvasAttachment(canvas,file.name,'file');
  } finally { URL.revokeObjectURL(url); }
}

// Capture the rendered lesson only. Inline computed styles and freeze SVG frames;
// no desktop permission, remote resources, script, or hidden solution is captured.
export async function captureLesson(element) {
  if(!element || !element.getClientRects().length)throw Error('请先打开需要截图的课件页');
  await document.fonts.ready;
  const bounds=element.getBoundingClientRect(), width=Math.ceil(bounds.width),height=Math.ceil(bounds.height);
  if(!width||!height)throw Error('当前课件没有可截图的内容');
  const clone=element.cloneNode(true);
  const originals=[element,...element.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  for(let i=0;i<originals.length;i++){
    const from=originals[i],to=copies[i],style=getComputedStyle(from);
    if(['SCRIPT','IFRAME','OBJECT','EMBED','LINK','STYLE'].includes(from.tagName)){to.remove();continue;}
    for(const attribute of [...to.attributes])if(/^on/i.test(attribute.name))to.removeAttribute(attribute.name);
    for(const key of style){const value=style.getPropertyValue(key);to.style.setProperty(key,/url\(/i.test(value)?'none':value);}
    to.style.animation='none';to.style.transition='none';to.removeAttribute('id');
    if(from.tagName==='IMG'){
      if(style.display==='none'||!from.naturalWidth){to.remove();continue;}
      const embedded=document.createElement('canvas');embedded.width=from.naturalWidth;embedded.height=from.naturalHeight;
      embedded.getContext('2d').drawImage(from,0,0);
      try{to.src=embedded.toDataURL('image/png');to.removeAttribute('srcset');}
      catch{throw Error('课件中的图片无法内部截图，请改用选择图片上传截图');}
    }
  }
  // Apply after copying all descendant styles so the frozen scroll offset survives.
  for(let i=0;i<originals.length;i++)if(originals[i].tagName==='PRE'&&(originals[i].scrollTop||originals[i].scrollLeft)&&copies[i].firstElementChild){
    const child=copies[i].firstElementChild;child.style.display='block';child.style.transform=`translate(${-originals[i].scrollLeft}px,${-originals[i].scrollTop}px)`;
  }
  clone.style.margin='0';clone.style.position='relative';clone.style.left='0';clone.style.top='0';clone.style.width=width+'px';clone.style.height=height+'px';clone.style.boxSizing='border-box';clone.style.transform='none';
  clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const scale=Math.min(1.5,2000/width,5000/height,Math.sqrt(8000000/(width*height)));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const img=await loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  // Detect a browser that disallows SVG canvas export before showing the dialog.
  canvas.toDataURL('image/png');return canvas;
}

export function cropBounds(start,end,width,height) {
  const x=Math.max(0,Math.min(width,Math.min(start.x,end.x))),y=Math.max(0,Math.min(height,Math.min(start.y,end.y)));
  return {x,y,width:Math.max(0,Math.min(width,Math.max(start.x,end.x))-x),height:Math.max(0,Math.min(height,Math.max(start.y,end.y))-y)};
}

export function previewCrop(canvas) {
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='chat-crop-dialog';
    dialog.innerHTML='<div class="dialog-heading"><h2>截取当前课件</h2><button type="button" data-cancel class="icon-button" aria-label="取消截图">×</button></div><p class="small muted">拖动框选要提问的区域；不框选则使用整页。只截取课件内容。</p><div class="chat-crop-stage"><img alt="课件截图预览" draggable="false"><div class="chat-crop-selection" hidden></div></div><p class="small muted" data-crop-status role="status">已选择整页</p><div class="dialog-footer"><button type="button" class="ghost" data-reset>使用整页</button><button type="button" class="ghost" data-cancel>取消</button><button type="button" class="primary" data-attach>加入问题</button></div>';
    const stage=dialog.querySelector('.chat-crop-stage'),img=stage.querySelector('img'),box=stage.querySelector('div'),status=dialog.querySelector('[data-crop-status]');
    img.src=canvas.toDataURL('image/png');let start=null,selection=null,done=false;
    const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(value);};
    const point=e=>{const r=img.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};};
    const reset=()=>{selection=null;box.hidden=true;status.textContent='已选择整页';};
    stage.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();start=point(e);stage.setPointerCapture(e.pointerId);};
    stage.onpointermove=e=>{if(!start)return;selection=cropBounds(start,point(e),canvas.width,canvas.height);box.hidden=false;Object.assign(box.style,{left:selection.x/canvas.width*100+'%',top:selection.y/canvas.height*100+'%',width:selection.width/canvas.width*100+'%',height:selection.height/canvas.height*100+'%'});status.textContent=`已框选 ${Math.round(selection.width)} × ${Math.round(selection.height)} 像素`;};
    stage.onpointerup=()=>{start=null;if(!selection||selection.width<10||selection.height<10)reset();};
    stage.onpointercancel=()=>{start=null;reset();};
    dialog.querySelector('[data-reset]').onclick=reset;
    dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>finish(null));
    dialog.oncancel=e=>{e.preventDefault();finish(null);};
    dialog.querySelector('[data-attach]').onclick=()=>{
      if(!selection)return finish(canvas);
      const cropped=document.createElement('canvas');cropped.width=Math.max(1,Math.round(selection.width));cropped.height=Math.max(1,Math.round(selection.height));
      cropped.getContext('2d').drawImage(canvas,selection.x,selection.y,selection.width,selection.height,0,0,cropped.width,cropped.height);finish(cropped);
    };
    document.body.append(dialog);dialog.showModal();
  });
}
