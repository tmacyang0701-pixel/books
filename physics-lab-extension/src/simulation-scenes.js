import {shape,palette as P,ground,clamp} from './world.js';
import {lensImage,circuitValues,iceHeating} from './simulations.js';

const red=[.83,.24,.20],gold=[.93,.65,.24],white=[.95,.96,.90],water=[.25,.65,.79];
const norm=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function link(a,b,width=.035,color=P.dark,alpha=1){
 const d=b.map((x,i)=>x-a[i]),y=norm(d),x=norm(cross(Math.abs(y[1])>.9?[0,0,1]:[0,1,0],y)),z=cross(x,y);
 return {...shape('cylinder',a.map((x,i)=>(x+b[i])/2),[width,Math.max(.001,Math.hypot(...d)),width],color,alpha),orientation:[...x,...y,...z]};
}
function builder(){
 const items=ground(),labels=[];
 const box=(p,s,c=P.steel,a=1,angle=0)=>items.push(shape('box',p,s,c,a,angle));
 const ball=(p,s,c=P.teal,a=1)=>items.push(shape('sphere',p,typeof s==='number'?[s,s,s]:s,c,a));
 const rod=(a,b,w=.035,c=P.dark,alpha=1)=>items.push(link(a,b,w,c,alpha));
 const path=(points,w=.025,c=P.orange,alpha=1)=>{for(let i=1;i<points.length;i++)rod(points[i-1],points[i],w,c,alpha);};
 const label=(text,pos)=>labels.push({text,pos});
 const arrow=(a,b,c=P.orange,w=.025)=>{rod(a,b,w,c);const d=norm(b.map((v,i)=>v-a[i])),side=norm(cross(d,Math.abs(d[2])<.8?[0,0,1]:[0,1,0]));for(const sign of [-1,1])rod(b,b.map((v,i)=>v-.17*d[i]+sign*.09*side[i]),w,c);};
 const ring=(center,r,axis='y',c=P.dark,w=.025)=>{const points=[];for(let i=0;i<=32;i++){const t=i*Math.PI/16,a=Math.cos(t)*r,b=Math.sin(t)*r;points.push(center.map((v,k)=>v+(axis==='x'?[0,a,b]:axis==='z'?[a,b,0]:[a,0,b])[k]));}path(points,w,c);};
 const stand=(x,y,z=0)=>{box([x,.08,z],[.7,.16,.65],P.dark);rod([x,.1,z],[x,y,z],.035,P.steel);};
 const beaker=(x,level=1.4,z=0,r=.65,height=2.5)=>{items.push(shape('tube',[x,height/2+.12,z],[r,height,r],P.glass,.14),shape('cylinder',[x,.13,z],[r,.05,r],P.glass,.25));ring([x,height+.12,z],r,'y',P.steel,.018);if(level>0)items.push(shape('cylinder',[x,.16+level/2,z],[r*.94,level,r*.94],water,.23));for(let i=1;i<=5;i++)rod([x+r,.12+i*height/6,z-.11],[x+r,.12+i*height/6,z+.11],.012,P.dark);};
 const meter=(x,y,z,value,max,title)=>{box([x,y,z],[1.15,.9,.4],white);box([x,y+.04,z+.21],[1,.65,.02],P.dark,.1);const a=Math.PI*(1-clamp(value/max,0,1));for(let i=0;i<=10;i++){const t=Math.PI-i*Math.PI/10;rod([x+Math.cos(t)*.38,y-.18+Math.sin(t)*.38,z+.235],[x+Math.cos(t)*.44,y-.18+Math.sin(t)*.44,z+.235],.009,P.dark);}rod([x,y-.18,z+.26],[x+Math.cos(a)*.36,y-.18+Math.sin(a)*.36,z+.26],.014,Math.abs(value)>max?red:red);label(title,[x,y+.68,z]);};
 return {items,labels,box,ball,rod,path,label,arrow,ring,stand,beaker,meter};
}
function optical(b,id,p,r){
 const {box,ball,rod,path,arrow,label,stand,beaker}=b,axis=1.45;
 if(id==='reflection'||id==='refraction'){
  const y=1.8,a=p.angle*Math.PI/180;box([0,y-.04,0],[4,.08,2.1],id==='reflection'?P.steel:water,id==='reflection'?.8:.16);
  if(id==='refraction')box([0,.85,0],[4,1.75,2.1],water,.11);
  const start=[-1.65*Math.sin(a),y+1.65*Math.cos(a),0];ball(start,.13,red);arrow(start,[0,y,0],red);
  const angle=id==='reflection'?a:r.metrics[1][1]===null?null:r.metrics[1][1]*Math.PI/180;
  arrow([0,y,0],[1.65*Math.sin(angle??a),y+(id==='reflection'||angle===null?1:-1)*1.65*Math.cos(angle??a),0],gold);
  for(let i=0;i<10;i++)rod([0,.3+i*.33,.02],[0,.45+i*.33,.02],.009,P.dark);
  stand(-2.1,1.8,-.8);stand(2.1,1.8,-.8);label('入射光',start.map((v,i)=>v+(i===0?-.25:0)));label('法线',[0,3.65,0]);label(id==='reflection'?'平面镜':p.medium===2?'水 → 空气':'空气 → '+(p.medium===1?'玻璃':'水'),[1.7,.25,0]);return;
 }
 if(id==='color'){
  box([1.4,1.6,0],[.08,2.5,2.4],white);const c=[p.r/255,p.g/255,p.b/255];
  for(let i=0;i<3;i++){const z=(i-1)*1.05,color=[0,0,0];color[i]=Math.max(.08,c[i]);box([-2,1.15,z],[.8,.55,.55],P.dark);ball([-1.55,1.15,z],[.08,.2,.2],color);rod([-1.5,1.15,z],[1.32,1.6,0],.08,color,c[i]*.4+.03);}
  ball([1.33,1.6,0],[.015,.65,.65],c);label('合成色光',[1.3,3,0]);return;
 }
 if(id==='vision'){
  ball([.65,axis,0],[1.4,1.1,1],P.glass,.14);ball([-.6,axis,0],[.12,.65,.65],P.blue,.45);box([1.8,axis,0],[.04,1.6,1.3],red,.23);
  if(p.lens){ball([-1.7,axis,0],[p.lens>0?.12:.06,.75,.6],P.teal,.4);label(p.lens>0?'会聚矫正镜':'发散矫正镜',[-1.7,2.6,0]);}
  const focus=-.6+r.metrics[0][1]/r.metrics[1][1]*2.4;
  for(const side of [-1,1])path([[-3,axis+side*.5,0],[-.6,axis+side*.5,0],[focus,axis,0]],.018,gold);
  label('视网膜',[1.8,2.7,0]);label('成像位置',[focus,axis-.35,0]);return;
 }
 if(id==='plane-mirror'){
  const d=p.d/80*2.6,h=p.h/12*1.6;box([0,1.65,0],[.04,3,1.8],P.glass,.26);stand(0,.5);arrow([-d,.4,0],[-d,.4+h,0],P.teal,.065);arrow([d,.4,0],[d,.4+h,0],P.orange,.045);
  for(const yy of [.7,1.6]){path([[-d,.4+h,0],[0,yy,0],[-d,2*yy-(.4+h),0]],.012,gold);for(let i=0;i<8;i++){const f=i/8,g=(i+.45)/8;rod([d*f,yy+(.4+h-yy)*f,0],[d*g,yy+(.4+h-yy)*g,0],.01,P.orange,.5);}}
  label('实物',[-d,2.9,0]);label('虚像（延长线交点）',[d,3.3,0]);return;
 }
 const image=id==='lens'?lensImage(p.u,p.f):{v:p.v,m:-p.v/p.u},max=Math.max(p.u,Math.abs(image.v||p.u),id==='lens'?p.f*2:0),s=2.7/max,u=p.u*s,v=image.v===null?null:image.v*s;
 const h=Math.min(id==='lens'?.62:p.h*.1,1.1/Math.max(1,Math.abs(image.m||1)));
 box([0,.15,0],[6,.16,.52],P.dark);for(let i=0;i<=24;i++)rod([-3+i*.25,.24,-.23],[-3+i*.25,.24,-.06],.008,white);
 stand(-u,axis);arrow([-u,axis,0],[-u,axis+h,0],P.orange,.045);label('物体',[-u,axis+h+.3,0]);stand(0,axis);
 if(id==='lens'){ball([0,axis,0],[.1,.9,.75],P.blue,.35);label('凸透镜',[0,2.7,0]);for(const sign of [-1,1]){ball([sign*p.f*s,axis,0],.035,red);label('F',[sign*p.f*s,axis-.25,0]);}}
 else{box([0,axis+.55,0],[.05,1.05,1.5],P.dark);box([0,axis-.55,0],[.05,1.05,1.5],P.dark);box([0,axis,-.4],[.05,.06,.72],P.dark);box([0,axis,.4],[.05,.06,.72],P.dark);label('小孔',[0,2.9,0]);}
 if(v!==null){arrow([v,axis,0],[v,axis+h*image.m,0],P.teal,.04);label(v>0?'光屏上的实像':'虚像延长线交点',[v,2.9,0]);if(v>0){stand(v,axis);box([v+.04,axis,0],[.04,2.3,1.6],white,.4);}}
 const endX=Math.min(2.8,(axis-.15)*u/h),centralEnd=v!==null&&v>0?[v,axis+h*image.m,0]:[endX,axis-h/u*endX,0];path([[-u,axis+h,0],[0,axis,0],centralEnd],.012,gold);
 if(id==='lens'){
  const rayEnd=v!==null&&v>0?v:Math.min(2.8,(axis+h-.15)*p.f*s/h);path([[-u,axis+h,0],[0,axis+h,0],[rayEnd,axis+h-h/(p.f*s)*rayEnd,0]],.012,red);
  if(v!==null&&v<0)for(let i=0;i<12;i++){const a=i/12,c=(i+.5)/12;rod([v*a,axis+h+(h*image.m-h)*a,0],[v*c,axis+h+(h*image.m-h)*c,0],.009,red,.5);}
 }else path([[-u,axis,0],[0,axis,0],[v,axis,0]],.01,red);
}
function thermal(b,id,p,r,t){
 const {box,ball,rod,path,label,ring,beaker}=b;
 if(id==='phase-cycle'||id==='diffusion'){
  const states=id==='phase-cycle'?[p.from,p.to]:[1,1];
  for(let side=0;side<2;side++){const x=side?1.5:-1.5,state=states[side];beaker(x,0,0,.95,2.7);
   for(let i=0;i<48;i++){const ix=i%4,iy=Math.floor(i/4)%4,iz=Math.floor(i/16),j=(i*2.39996),speed=id==='diffusion'?Math.sqrt((p.temp+273)/293):1;
    let dx=(ix-1.5)*.36,dy=.5+iy*.34,dz=(iz-1)*.38;
    if(state===1){dx+=Math.sin(j+t*speed)*.1;dy+=Math.cos(j*1.7+t*speed)*.07;dz+=Math.sin(j*2.3+t*speed)*.1;}
    if(state===2){dx=Math.sin(j+t*.45)*.78;dy=.35+(Math.sin(j*1.3+t*.8)+1)*1.05;dz=Math.cos(j*1.9+t*.55)*.72;}
    const mix=id==='diffusion'?(side?clamp(Math.sqrt(p.time*(p.temp+273)/293)/8,0,1):0):1;
    if(id==='diffusion'){dx=(i<24?-.4:.4)*(1-mix)+Math.sin(j+t*speed)*mix*.7;dy=.4+(i%12)/12*1.8;dz=Math.cos(j)*.6;}
    ball([x+dx,dy,dz],.065,id==='diffusion'?(i<24?red:P.blue):P.teal);
   }label(id==='phase-cycle'?['固态','液态','气态'][state]:side?'扩散后':'起始状态',[x,3.15,0]);
  }return;
 }
 const temp=id==='thermometer'?p.t:id==='melting'?iceHeating(p.q*1000,p.m).t:id==='boiling'?r.metrics[0][1]:id==='heat-capacity'?20+r.metrics[1][1]:20+r.metrics[0][1]/100;
 const x=id==='thermometer'?0:-.9;beaker(x,1.35,0,.85,2.1);
 const height=.35+clamp((temp+10)/120,0,1)*2.4;
 box([x+.3,1.85,.15],[.21,3.3,.12],white,.7);rod([x+.3,.3,.24],[x+.3,.3+height,.24],.035,red);ball([x+.3,.3,.24],.11,red);
 for(let i=0;i<=11;i++)rod([x+.34,.65+i*.22,.25],[x+.45,.65+i*.22,.25],.009,P.dark);
 label(Math.round(temp*10)/10+' °C',[x+.55,3.6,0]);
 if(id==='thermometer')return;
 box([x,.1,0],[1.9,.17,1.9],P.dark);ring([x,.21,0],.58,'y',red,.045);label('加热器',[x,.2,1.2]);
 if(id==='melting'){
  const remain=clamp(1-(p.q*1000-p.m*21000)/(p.m*334000),0,1);
  for(let i=0;i<6;i++){const s=.25*Math.cbrt(Math.max(.00001,remain));box([x+Math.cos(i)*.42,.65+(i%2)*.4,Math.sin(i)*.42],[s,s,s],P.glass,.9);}
 }else if(id==='boiling'&&temp>=p.bp-.1){for(let i=0;i<12;i++){const y=.3+((i*.17+t*.3)%1)*1.5;ball([x+Math.sin(i*2.4)*.5,y,Math.cos(i*2.4)*.45],.055,white,.5);}}
 if(id==='joule'){
  path(Array.from({length:50},(_,i)=>[x-.55+i*.022,.65+.13*Math.sin(i*.65),.13*Math.cos(i*.65)]),.025,red);
  box([1.7,.5,0],[.8,.9,.7],P.dark);path([[1.3,.7,0],[.5,.7,.7],[x-.6,.6,.7],[x-.6,.6,0]],.025,red);label('电阻丝',[x,.9,-.5]);label('通电热效应',[1.7,1.3,0]);
 }else{box([1.7,.5,0],[.95,.6,.7],P.dark);label(id==='heat-capacity'?(p.material?'油':'水'):id==='melting'?iceHeating(p.q*1000,p.m).phase:'观察温度平台',[1.4,1.5,0]);}
}
function mechanics(b,id,p,r,t){
 const {items,box,ball,rod,path,arrow,label,ring,stand,beaker,meter}=b;
 if(id==='ruler'){
  box([0,.3,0],[6,.12,.65],gold);const x=n=>n/15*5.6-2.8;
  for(let i=0;i<=150;i++)rod([x(i/10),.37,-.3],[x(i/10),.37,-.3+(i%10===0?.26:i%5===0?.19:.1)],.005,P.dark);
  for(let i=0;i<=15;i+=3)label(String(i),[x(i),.4,.38]);box([(x(p.start)+x(p.end))/2,.65,0],[x(p.end)-x(p.start),.3,.3],P.teal);label('被测物体',[0,1.1,0]);return;
 }
 if(id==='stopwatch'){
  stand(-1,3);rod([-1,3,0],[0,3,0]);const a=Math.sin(t*2*Math.PI/p.period)*.45;rod([0,3,0],[Math.sin(a)*1.9,3-Math.cos(a)*1.9,0],.012);ball([Math.sin(a)*1.9,3-Math.cos(a)*1.9,0],.2,P.orange);
  meter(1.8,1.1,0,(p.n*p.period+p.error)%60,60,'停表 / 累计 '+p.n+' 次');label('摆的周期保持不变',[-.8,3.5,0]);return;
 }
 if(id==='balance'){
  stand(0,1.7);const a=clamp((p.mass-p.weights-p.rider)/60,-.3,.3);box([0,1.7,0],[4,.12,.2],P.steel,1,a);
  for(const side of [-1,1]){const x=side*1.65*Math.cos(a),y=1.7+side*1.65*Math.sin(a);rod([x,y,0],[x,y+.55,0],.035);items.push(shape('cylinder',[x,y+.6,0],[.65,.07,.65],P.dark));if(side<0)box([x,y+.9,0],[.5,.55,.5],P.teal);else for(let i=0;i<Math.ceil(p.weights/20);i++)items.push(shape('cylinder',[x+(i%3-1)*.25,y+.75+Math.floor(i/3)*.22,0],[.11,.22,.11],gold));}
  const riderX=p.rider/10*1.5;box([riderX,1.7+riderX*Math.sin(a),.08],[.16,.23,.3],P.orange);label('物体',[-1.65,3.3,0]);label('砝码',[1.65,3.3,0]);label('游码',[.7,1.05,.25]);return;
 }
 if(id==='density'){
  for(const [x,v] of [[-1.4,p.v1],[1.4,p.v2]]){beaker(x,v/100*2.5,0,.55,2.8);label(v+' mL',[x,3.25,0]);}
  const s=Math.cbrt((p.v2-p.v1)/100)*.8;box([1.4,.2+s/2,0],[s,s,s],P.orange);box([-1.4,0,.9],[1,.08,.7],P.dark);label(p.mass+' g',[0,.4,1.15]);return;
 }
 if(id==='spring'){
  stand(-.9,3.5);rod([-.9,3.5,0],[.1,3.5,0],.07);const length=.8+(p.m/100/p.k)*3;
  path(Array.from({length:81},(_,i)=>[Math.cos(i*Math.PI/4)*.18,3.3-i/80*length,Math.sin(i*Math.PI/4)*.18]),.025,P.steel);
  const y=3.25-length;box([0,y-.25,0],[.5,.5,.5],P.orange);arrow([.6,y,0],[.6,y-.7,0],red);label('弹簧伸长量',[.9,2.7,0]);return;
 }
 if(id==='lever'){
  stand(0,1.65);const angle=clamp((p.f1*p.l1-p.f2*p.l2)*.25,-.3,.3);box([0,1.65,0],[5.3,.12,.22],P.steel,1,angle);
  for(const [side,length,force] of [[-1,p.l1,p.f1],[1,p.l2,p.f2]]){const x=side*length*5*Math.cos(angle),y=1.65+side*length*5*Math.sin(angle);rod([x,y,0],[x,y-.5,0],.012);box([x,y-.7,0],[.4,.4,.4],side<0?P.teal:gold);arrow([x,y-.9,0],[x,y-.9-force*.045,0],red);label(force+' N',[x,y+.4,0]);}label('支点',[0,2.05,0]);return;
 }
 if(id==='pulley'){
  box([0,3.4,0],[4,.15,.55],P.dark);const low=.7+p.h*.45,n=p.n;
  if(n===1){rod([0,3.3,0],[0,2.85,0]);ring([0,2.6,0],.32,'z',P.steel,.09);path([[-.32,low,0],[-.32,2.6,0],[0,2.94,0],[.32,2.6,0],[.32,.5,0]],.025,gold);box([-.32,low-.25,0],[.6,.5,.5],P.teal);arrow([.32,.65,0],[.32,.2,0],red);}
  else{
   const xs=Array.from({length:n},(_,i)=>(i-(n-1)/2)*.55);
   for(let i=0;i<n;i++)rod([xs[i],low+.35,0],[xs[i],3.1,0],.025,gold);
   for(let i=0;i<n-1;i++){
    const isBottom=i%2===0,y=isBottom?low+.35:3.1,x=(xs[i]+xs[i+1])/2;
    ring([x,y,0],.24,'z',P.steel,.04);rod([x,y,-.1],[x,isBottom?low-.05:3.4,-.1],.035);
    path(Array.from({length:17},(_,j)=>{const a=Math.PI+(isBottom?1:-1)*j*Math.PI/16;return[x+.275*Math.cos(a),y+.275*Math.sin(a),0];}),.025,gold);
   }
   box([0,low-.3,0],[Math.max(.7,n*.55),.5,.6],P.teal);
   const odd=n%2===1,direction=odd?-1:1,end=odd?xs[0]:xs.at(-1),turn=end+direction*.275;
   // Odd reeving anchors the final strand to the moving block; even reeving
   // anchors the first strand overhead. The free end remains outside the block.
   if(odd)rod([xs.at(-1),low+.35,0],[xs.at(-1),low-.05,0],.025,gold);
   else rod([xs[0],3.1,0],[xs[0],3.4,0],.025,gold);
   ring([turn,3.1,0],.24,'z',P.steel,.04);rod([turn,3.1,-.1],[turn,3.4,-.1],.035);
   path(Array.from({length:17},(_,j)=>{const a=odd?j*Math.PI/16:Math.PI-j*Math.PI/16;return[turn+.275*Math.cos(a),3.1+.275*Math.sin(a),0];}),.025,gold);
   rod([end+direction*.55,3.1,0],[end+direction*.55,.6,0],.025,gold);arrow([end+direction*.55,.6,0],[end+direction*.55,.2,0],red);
  }label(n+' 段承重绳',[0,3.8,0]);label('重物 '+p.g+' N',[-1.8,.45,0]);return;
 }
 if(id==='liquid-pressure'){
  box([0,1.55,0],[2.8,3,1.6],P.glass,.12);box([0,1.45,0],[2.7,2.8,1.5],water,.17);const y=2.9-p.depth*1.2,dir=p.direction===0?[0,-.3,0]:p.direction===1?[-.3,0,0]:[.3,0,0];rod([-.3,y,0],[-.3+dir[0]*.2,y+dir[1]*.2,0],.24,P.dark);arrow([-.3,y,0],[-.3+dir[0],y+dir[1],0],red);
  const delta=p.depth*p.rho/1200*.5;path([[2,2.8,0],[2,.3,0],[2.65,.3,0],[2.65,2.8,0]],.08,P.glass,.35);path([[2,1.4-delta,0],[2,.3,0],[2.65,.3,0],[2.65,1.4+delta,0]],.055,red);path([[-.3,y,0],[1.6,y,.5],[2,2.8,0]],.025,P.dark);label('U 形管压强计',[2.2,3.3,0]);return;
 }
 if(id==='atmosphere'){
  items.push(shape('dome',[0,.3,0],[1.35,2.2,1.15],P.glass,.2));box([0,.15,0],[3,.2,2.5],P.dark);
  for(let i=0;i<18;i++)if(i/18<p.inside/105)ball([Math.sin(i*2.4)*.9,.5+(i%4)*.32,Math.cos(i*2.4)*.7],.045,P.teal);
  for(const x of [-1,1])arrow([x*2.3,1.25,0],[x*1.45,1.25,0],p.outside>p.inside?red:P.gray);
  meter(2.3,.7,0,p.inside,110,'内压 / kPa');label('外压 '+p.outside+' kPa',[0,3.1,0]);return;
 }
 if(id==='buoyancy'){
  beaker(0,1.8,0,1.05,2.5);const frac=p.v/200,bodyY=2.41-frac*.9;box([0,bodyY,0],[.6,.9,.6],P.orange);stand(-1.5,3.7);rod([-1.5,3.7,0],[0,3.7,0]);rod([0,3.7,0],[0,bodyY+.45,0],.018);arrow([.65,bodyY-.4,0],[.65,bodyY-.4+frac*p.rho/1200,0],P.teal);arrow([-.65,bodyY+.3,0],[-.65,bodyY+.3-p.g*.1,0],red);label('排开液体 '+p.v+' cm³',[0,3.1,.2]);label('弹簧测力计示数见下方',[-1,4,0]);return;
 }
 if(id==='pressure'){
  box([0,.3,0],[3.8,.5,2.3],[.66,.79,.56]);const width=Math.sqrt(p.s/200)*2.8,depth=clamp(p.f/p.s*.25,0,.35);box([0,.6-depth,0],[width,.16,width*.55],P.dark);box([0,.95-depth,0],[.7,.6,.6],P.steel);arrow([0,2.8,0],[0,1.3-depth,0],red,.045);label('受力面积随滑块改变',[0,3.2,0]);return;
 }
 if(id==='equilibrium'){
  box([0,1.1,0],[1.2,.6,.7],P.teal);for(const [sign,force] of [[-1,p.left],[1,p.right]])arrow([sign*.6,1.1,0],[sign*(.6+force/10),1.1,0],sign<0?P.orange:red);label('同一直线、相反方向',[0,2.1,0]);return;
 }
 if(id==='kinetic-energy'){
  const start=[-2.5,.5+p.h*.5,0],end=[2.5,.3,0],progress=p.progress/100;rod(start,end,.08,P.steel);for(const z of [-.35,.35])rod(start.map((v,i)=>i===2?z:v),end.map((v,i)=>i===2?z:v),.035);
  const q=start.map((v,i)=>v+(end[i]-v)*progress);ball([q[0],q[1]+.2,0],.13+Math.cbrt(p.m)*.1,P.orange);arrow([q[0],q[1]+.55,0],[q[0]+.65,q[1]+.55,0],P.teal);label('降低的高度转为动能和内能',[0,3.7,0]);return;
 }
 // Speed, friction, inertia and work share a physical track and cart, with distinct controls.
 box([0,.2,0],[6,.2,1.5],id==='friction'?[P.light,[.62,.54,.40],[.75,.67,.51]][p.surface]:P.light);
 if(id==='friction')for(let i=0;i<36;i++)box([-2.7+(i%12)*.48,.32,-.5+Math.floor(i/12)*.5],[.05+(p.surface||0)*.035,.025+(p.surface||0)*.025,.06],P.gray);
 const distance=id==='inertia'?Math.max(0,p.v*p.t-.5*p.a*p.t*p.t):p.s??2;
 const phase=t?((t*.25)%1):.35,x=-2.4+clamp(distance/5,0,1)*4.8*phase;
 box([x,.68,0],[1.1,.45,.65],P.teal);for(const side of [-1,1])for(const z of [-.38,.38])ball([x+side*.36,.4,z],[.16,.16,.07],P.dark);
 const force=id==='friction'?r.metrics[0][1]:id==='work'?p.f:0;
 if(force)arrow([x+.55,.8,0],[x+.9+clamp(force/40,0,1),.8,0],red);
 if(id==='friction')for(let i=0;i<Math.ceil(p.n/5);i++)box([x,.98+i*.15,0],[.65,.13,.5],P.steel);
 label(id==='inertia'?'阻力为 0 时速度不变':id==='friction'?'匀速拉动，比较测力计示数':id==='work'?'力使物体沿力的方向移动':'记录距离与时间',[0,2.1,0]);
}
function electric(b,id,p,r,t){
 const {items,box,ball,rod,path,arrow,label,meter,ring}=b;
 if(id==='charge'){
  for(const [side,q] of [[-1,p.q1],[1,p.q2]]){const x=side*(.5+p.d*.35);rod([x,3,0],[x,1.5,0],.009);ball([x,1.25,0],.35,q===0?red:q===1?P.blue:P.gray);rod([x-.14,1.25,.36],[x+.14,1.25,.36],.015,white);if(q===0)rod([x,1.1,.36],[x,1.4,.36],.015,white);if(q===2)label('中性',[x,.6,0]);else if(p.q1!==2&&p.q2!==2){const dir=p.q1===p.q2?side:-side;arrow([x,1.25,0],[x+dir*.6,1.25,0],gold);}}
  box([0,3.05,0],[5,.1,.3],P.dark);return;
 }
 if(id==='resistance'){
  const turns=Math.max(2,Math.round(p.length)),width=.02+Math.sqrt(p.area)*.025;
  path(Array.from({length:turns*12+1},(_,i)=>[-2.4+i/(turns*12)*4.8,1.2+Math.cos(i*Math.PI/6)*.35,Math.sin(i*Math.PI/6)*.35]),width,p.mat?P.steel:gold);for(const x of [-2.5,2.5])box([x,.55,0],[.45,1,.6],P.dark);label((p.mat?'镍铬合金':'铜')+'导线',[0,2.2,0]);return;
 }
 if(id==='energy-use'){
  const n=Math.min(10,p.n);for(let i=0;i<n;i++){const x=(i%5-2)*1.1,z=Math.floor(i/5)*1.1;box([x,.5,z],[.6,.8,.6],P.dark);ball([x,1.05,z],.24,[1,clamp(.45+p.p/3000,0,1),.22]);}meter(0,2.2,-.8,p.hours,24,'日使用 '+p.hours+' h');label('统计 '+p.days+' 天',[0,3.4,0]);return;
 }
 const isLamp=id==='lamp-power',ohm=id==='ohm',u=p.u,r1=p.r1||p.r||8,r2=p.r2||10,closed=p.closed??1,mode=p.mode||0;
 const current=isLamp?r.metrics[0][1]:ohm?p.u/p.r:circuitValues({u,r1,r2,closed,mode}).i;
 box([0,.08,0],[6.1,.16,3.6],white);box([-2,.48,0],[.75,.8,.7],P.dark);label(u+' V',[-2,1.2,0]);ball([-2,.92,-.2],.065,red);ball([-2,.92,.2],.065,P.dark);
 const z=-.9,y=.4;let route=[[-2,.9,-.2],[-2,y,z],[1.8,y,z],[1.8,y,.9],[-2,y,.9],[-2,.9,.2]];
 // Break the positive wire at the switch when open.
 path([[-2,.9,-.2],[-2,y,z],[-1.35,y,z]],.025,red);path([[-.75,y,z],[1.8,y,z],[1.8,y,.9],[-2,y,.9],[-2,.9,.2]],.025,P.dark);
 rod([-1.35,y,z],[-.75,closed?y:y+.4,z],.04,P.steel);label(closed?'闭合':'断开',[-1.05,.95,z]);
  const resistor=(x,zz,name)=>{box([x,.45,zz],[.65,.25,.34],P.orange);label(name+' '+(name==='R₁'?r1:r2)+' Ω',[x,1.05,zz]);};
 if(mode){
  path([[-.3,y,z],[-.3,y,0],[1.3,y,0],[1.3,y,z]],.025,red);resistor(.5,z,'R₁');resistor(.5,0,'R₂');
 }else if(isLamp){box([.5,.4,z],[.6,.2,.6],P.dark);ball([.5,.85,z],[.32,.42,.32],gold,.22+clamp(p.u/3,0,1)*.45);path([[.37,.55,z],[.37,.85,z],[.63,.85,z],[.63,.55,z]],.018,[1,p.u/3,.15]);label('灯泡',[.5,1.5,z]);}
 else{resistor(.35,z,'R₁');if(!ohm)resistor(1.3,z,'R₂');}
 if(id==='ammeter'||ohm||isLamp){meter(-.65,.82,.85,current,id==='ammeter'?(p.range?3:.6):1,'A · 串联');}
 if(id==='voltmeter'||ohm||isLamp){const value=ohm||isLamp?u:circuitValues({u,r1,r2}).u1;meter(.4,1.8,.65,value,id==='voltmeter'?(p.range?15:3):6,'V · 并联');path([[.02,y,z],[.02,y,.65],[-.12,1.35,.65]],.021,red);path([[.68,y,z],[.9,y,.65],[.9,1.35,.65]],.021,P.dark);}
 if(closed&&current>0)for(let i=0;i<10;i++){let d=((t*.1*clamp(current,.08,1.5)+i/10)%1)*(route.length-1),j=Math.floor(d),f=d-j;const a=route[j],c=route[j+1];ball(a.map((v,k)=>v+(c[k]-v)*f),.04,gold);}
}
function magnetic(b,id,p,r,t){
 const {items,box,ball,rod,path,arrow,label,ring,meter}=b;
 if(id==='communication'){
  for(const x of [-2.6,2.6]){box([x,.3,0],[.6,.5,.6],P.dark);rod([x,.5,0],[x,2.7,0],.025,P.steel);ring([x,2.75,0],.25,'z',P.teal,.025);}
  const k=2+Math.log10(p.frequency+1)*1.6,points=Array.from({length:80},(_,i)=>{const x=-2.4+i/79*4.8;return [x,1.6+Math.sin(i/79*Math.PI*k-t*2)*.5,0];});path(points,.018,red);path(points.map((v,i)=>[v[0],1.6,Math.sin(i/79*Math.PI*k-t*2)*.5]),.018,P.blue);label('电场与磁场相互垂直',[0,2.8,0]);label(p.distance+' km',[0,.3,0]);return;
 }
 if(id==='compass'){
  const reverse=p.reverse;box([-.75,.4,0],[1.5,.4,.5],reverse?P.blue:red);box([.75,.4,0],[1.5,.4,.5],reverse?red:P.blue);label(reverse?'S':'N',[-1,.85,0]);label(reverse?'N':'S',[1,.85,0]);
  const x=p.x*.8,z=p.y*.65,a=r.metrics[0][1]*Math.PI/180;ring([x,.35,z],.35,'y',P.steel,.025);arrow([x,.38,z],[x+Math.cos(a)*.31,.38,z+Math.sin(a)*.31],red);rod([x,.38,z],[x-Math.cos(a)*.31,.38,z-Math.sin(a)*.31],.035,P.blue);label('磁针 N 极',[x,.95,z]);
  for(const sign of [-1,1])for(const spread of [.7,1.1,1.5])path(Array.from({length:26},(_,i)=>{const theta=i/25*Math.PI;return [-1.2*Math.cos(theta),.3,sign*Math.sin(theta)*spread];}),.009,P.teal,.5);return;
 }
 if(id==='solenoid'){
  const turns=Math.max(4,Math.round(p.n/5));path(Array.from({length:turns*12+1},(_,i)=>[-1.7+i/(turns*12)*3.4,1.45+Math.cos(i*Math.PI/6)*.55,Math.sin(i*Math.PI/6)*.55]),.035,gold);
  if(p.core)rod([-2,1.45,0],[2,1.45,0],.35,P.steel);box([0,.35,0],[4,.3,1],P.dark);label(p.i===0?'断电':p.i>0?'S ← 磁极 → N':'N ← 磁极 → S',[0,2.6,0]);
  if(p.i)for(const side of [-1,1])arrow([side*2,1.45,0],[side*2+Math.sign(p.i)*.65,1.45,0],red);return;
 }
 if(id==='motor'){
  box([0,.12,0],[4,.25,3.3],P.dark);for(const sign of [-1,1]){box([0,1.5,sign*1.35],[2.5,1.5,.5],(sign*Math.sign(p.b||1))<0?red:P.blue);label((sign*Math.sign(p.b||1))<0?'N':'S',[1.6,2.3,sign*1.35]);}
  const angle=p.angle*Math.PI/180+t*Math.sign(p.i*p.b)*Math.min(2,Math.abs(p.i*p.b)),points=[[-.7,.7],[.7,.7],[.7,2.3],[-.7,2.3],[-.7,.7]].map(([z,y])=>[z*Math.sin(angle),y,z*Math.cos(angle)]);path(points,.04,gold);rod([0,.3,0],[0,3,0],.06,P.steel);box([0,.55,0],[.35,.25,.35],gold);label('换向器',[1,.55,.7]);return;
 }
 // Induction: moving conductor, magnetic poles and a closed/open measuring circuit.
 box([0,.12,0],[4.5,.2,3],P.dark);box([0,.5,0],[1.8,.4,1.6],p.b<0?P.blue:red);box([0,2.65,0],[1.8,.4,1.6],p.b<0?red:P.blue);
 const x=p.direction?0:Math.sin(t*.7)*Math.sign(p.v)*.9,y=p.direction?1.5+Math.sin(t*.7)*Math.sign(p.v)*.55:1.5;
 rod([x,y,-.9],[x,y,.9],.055,gold);path([[x,y,-.9],[-2,1.5,-.9],[-2,1.5,.5]],.022,red);path([[-2,1.5,1.1],[x,y,.9]],.022,P.dark);rod([-2,1.5,.5],[-2,p.closed?1.5:1.9,1.1],.035,P.steel);
 meter(2,1.1,0,(r.metrics[1][1]+.3)/.6,1,'G · 正负偏转');arrow([x+.3,y,0],[x+.3+(p.direction?0:Math.sign(p.v)*.6),y+(p.direction?Math.sign(p.v)*.6:0),0],P.teal);label('切割磁感线',[0,3.2,0]);
}
function energy(b,p,t){
 const {box,rod,ball,arrow,label}=b;box([-1.7,.7,0],[1.2,1.3,1.2],P.dark);const phase=t*1.3;
 for(let i=0;i<4;i++){const a=phase+i*Math.PI/2;rod([-1.7,1.6,0],[-1.7+Math.cos(a)*.75,1.6+Math.sin(a)*.75,0],.09,P.teal);}ball([-1.7,1.6,0],.18,gold);
 arrow([-.7,1.7,0],[2,1.7,0],P.teal,.04);arrow([-.7,1.2,0],[1.2,.4,1],P.orange,.035);box([2,.6+p.eff/100,0],[.65,.65,.65],P.teal);
 label('输入 '+p.input+' J',[-1.7,3.1,0]);label('有用能 '+Math.round(p.input*p.eff/100)+' J',[1.6,2.8,0]);label('其他形式能量',[1,.35,1.5]);
}
export function sceneFor(def,p,result,time=0){
 const b=builder();
 if(def.module==='optics')optical(b,def.id,p,result);
 else if(def.module==='thermal'||def.id==='joule')thermal(b,def.id,p,result,time);
 else if(def.module==='mechanics')mechanics(b,def.id,p,result,time);
 else if(def.module==='electricity')electric(b,def.id,p,result,time);
 else if(def.module==='magnetism')magnetic(b,def.id,p,result,time);
 else if(def.id==='energy-budget')energy(b,p,time);
 else throw Error('Missing 3D scene: '+def.id);
 return {items:b.items,labels:b.labels};
}

// Three real configurations per experiment; step navigation changes apparatus conditions.
export const stepPresets={
 pinhole:[{u:40,v:10},{u:40,v:30},{u:80,v:30}],reflection:[{angle:20},{angle:40},{angle:60}],
 'plane-mirror':[{d:20,h:6},{d:50,h:6},{d:50,h:10}],refraction:[{angle:30,medium:0},{angle:60,medium:0},{angle:60,medium:2}],lens:[{f:10,u:30},{f:10,u:20},{f:10,u:5}],vision:[{eye:1,lens:0},{eye:1,lens:-3},{eye:2,lens:3}],color:[{r:255,g:0,b:0},{r:255,g:255,b:0},{r:255,g:255,b:255}],
 thermometer:[{t:0},{t:25},{t:80}],melting:[{m:1,q:0},{m:1,q:150},{m:1,q:400}],boiling:[{t:0},{t:300},{t:600}],
 'phase-cycle':[{from:0,to:1},{from:1,to:2},{from:2,to:0}],diffusion:[{temp:20,time:10},{temp:20,time:40},{temp:60,time:40}],
 'heat-capacity':[{mass:.5,q:10,material:0},{mass:.5,q:10,material:1},{mass:1,q:10,material:1}],
 ruler:[{start:0,end:6.3},{start:2,end:8.3},{start:5,end:11.3}],stopwatch:[{n:1},{n:10},{n:20}],balance:[{weights:60,rider:0},{weights:70,rider:0},{weights:70,rider:2}],density:[{mass:54,v1:20,v2:40},{mass:54,v1:30,v2:50},{mass:108,v1:30,v2:70}],
 speed:[{s:2,t:4},{s:4,t:4},{s:4,t:8}],spring:[{m:100},{m:200},{m:300}],friction:[{n:10,surface:0},{n:10,surface:2},{n:20,surface:2}],inertia:[{a:1},{a:.5},{a:0}],equilibrium:[{left:10,right:10},{left:10,right:15},{left:15,right:15}],pressure:[{f:20,s:100},{f:40,s:100},{f:40,s:200}],
 'liquid-pressure':[{depth:.5,rho:1000,direction:0},{depth:1,rho:1000,direction:0},{depth:1,rho:1000,direction:1}],atmosphere:[{inside:101},{inside:80},{inside:60}],buoyancy:[{v:0},{v:100},{v:200}],lever:[{f1:4,l1:.3,f2:6,l2:.2},{f1:4,l1:.4,f2:6,l2:.2},{f1:3,l1:.4,f2:6,l2:.2}],pulley:[{n:1},{n:2},{n:4}],work:[{f:20,s:1},{f:20,s:2},{f:40,s:2}],
 'kinetic-energy':[{progress:0,loss:0},{progress:50,loss:0},{progress:100,loss:20}],charge:[{q1:0,q2:0},{q1:0,q2:1},{q1:0,q2:2}],circuit:[{closed:0,mode:0},{closed:1,mode:0},{closed:1,mode:1}],ammeter:[{range:1,u:6},{range:0,u:6},{range:0,u:12,r1:2,r2:2}],voltmeter:[{range:1,u:6},{range:0,u:6},{range:0,u:12}],resistance:[{mat:0,length:10,area:1},{mat:0,length:20,area:1},{mat:1,length:20,area:1}],ohm:[{r:15,u:2},{r:15,u:4},{r:30,u:4}],
 'lamp-power':[{u:1.5},{u:2},{u:2.5}],joule:[{i:.5,r:10,t:20},{i:1,r:10,t:20},{i:1,r:10,t:40}],'energy-use':[{p:100,hours:5},{p:100,hours:3},{p:60,hours:3}],
 compass:[{reverse:0,x:-2,y:2},{reverse:0,x:2,y:2},{reverse:1,x:2,y:2}],solenoid:[{i:1,n:50,core:0},{i:-1,n:50,core:0},{i:-1,n:50,core:1}],motor:[{i:1,b:.5},{i:-1,b:.5},{i:-1,b:-.5}],induction:[{v:1,b:.5,closed:1,direction:0},{v:-1,b:.5,closed:1,direction:0},{v:-1,b:.5,closed:0,direction:0}],communication:[{frequency:100,distance:300},{frequency:200,distance:300},{frequency:200,distance:3000}],
 'energy-budget':[{input:1000,eff:40},{input:1000,eff:70},{input:2000,eff:70}]
};
