(()=>{
 'use strict';
 const $=id=>document.getElementById(id),paint={红:'#c54f48',蓝:'#4779b9',绿:'#43825c',黄:'#b77e13'};
 const busyStates=['preparing','countdown','recording','encoding','grading'];
 let state='idle',session=null,stream=null,recorder=null,audioContext=null,chunks=[],ticker=0,stopTimer=0,started=0,elapsed=0,wav=null,audioURL=null,epoch=0;
 let saved=[];try{const rows=JSON.parse(localStorage.getItem('number-garden-stroop-v1')||'[]');if(Array.isArray(rows))saved=rows.filter(r=>r&&Number.isFinite(r.at)&&Number.isFinite(r.score)&&[12,24,36].includes(r.total)&&Number.isFinite(r.correct)).slice(0,50);}catch{}
 const busy=()=>busyStates.includes(state);
 const clock=s=>{const t=Math.ceil(s);return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
 function status(text,error=false){$('stroopStatus').textContent=text;$('stroopStatus').classList.toggle('error',error);}
 function setState(value){state=value;document.body.classList.toggle('is-recording',value==='recording');const locked=busy();for(const id of ['stroopDuration','stroopCount'])$(id).disabled=locked;window.TrainingNavigation.lock('stroop',locked);$('stroopStart').disabled=locked;$('stroopStart').textContent=locked?'正在训练…':value==='done'||value==='error'?'◉ 再练一轮':'◉ 开始录音训练';$('stroopStop').hidden=value!=='recording';$('stroopRetry').hidden=value!=='error'||!wav;$('recordingPill').classList.toggle('recording',value==='recording');$('recordingPill').textContent=({idle:'等待开始',preparing:'准备麦克风',countdown:'准备开始',recording:'正在录音',encoding:'处理录音',grading:'模型评分中',done:'本轮已完成',error:'等待重试'})[value];}
 function stopTracks(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}}
 function clearTimers(){clearInterval(ticker);clearTimeout(stopTimer);}
 async function closeAudio(){if(audioContext){const context=audioContext;audioContext=null;try{await context.close();}catch{}}}
 function failure(error){clearTimers();stopTracks();void closeAudio();setState('error');status(error?.message||'本次训练未能完成，请重试。',true);}
 async function api(path,data){
  let response;try{response=await fetch('/api/stroop/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(path==='grade'?185_000:20_000)});}catch{throw new Error('网络连接超时，请检查连接后重试。');}
  let body;try{body=await response.json();}catch{throw new Error('无法连接评分服务，请刷新页面确认登录状态。');}
  if(!response.ok)throw new Error(body.error||'评分暂时不可用，请稍后重试。');return body;
 }
 function records(){const el=$('stroopRecords');el.replaceChildren();if(!saved.length){el.className='record-empty';el.textContent='完成训练后，得分会保存在这里。';return;}el.className='';for(const r of saved.slice(0,3)){const row=document.createElement('div'),label=document.createElement('span'),small=document.createElement('small'),score=document.createElement('b');row.className='stroop-record';label.textContent=`${r.correct} / ${r.total} 题正确`;small.textContent=`${new Date(r.at).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} · ${r.duration} 秒限时`;label.append(small);score.textContent=r.score+'分';row.append(label,score);el.append(row);}}
 function draw(items){$('stroopGrid').replaceChildren();items.forEach((item,i)=>{const card=document.createElement('div'),n=document.createElement('small'),word=document.createElement('span');card.className='stroop-cell';card.dataset.word=item.word;card.dataset.color=item.color;n.textContent=String(i+1).padStart(2,'0');word.className='stroop-word';word.textContent=item.word;word.style.color=paint[item.color];card.append(n,word);$('stroopGrid').append(card);});}
 function setupPreview(){const count=Number($('stroopCount').value);$('stroopTotal').innerHTML=`${count}<small>题</small>`;$('stroopTimer').textContent=clock(Number($('stroopDuration').value));draw(Array.from({length:count},(_,i)=>({word:['蓝','绿','黄','红'][i%4],color:['红','蓝','绿','黄'][i%4]})));$('stroopCover').hidden=false;}
 async function toWav(blob){
  if(!blob.size)throw new Error('未收到录音，请检查麦克风后重新开始。');
  let buffer;try{buffer=await audioContext.decodeAudioData(await blob.arrayBuffer());}catch{throw new Error('浏览器无法处理这段录音，建议使用最新版 Chrome 或 Safari 重试。');}
  if(buffer.duration<.1)throw new Error('录音太短，请重新开始并朗读题目。');
  const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*16000),16000),source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();const converted=await offline.startRendering(),samples=converted.getChannelData(0);
  const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes),str=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
  str(0,'RIFF');view.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);
  let energy=0,peak=0;for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));energy+=s*s;peak=Math.max(peak,Math.abs(s));view.setInt16(44+i*2,s<0?s*32768:s*32767,true);}
  if(peak<.005||Math.sqrt(energy/samples.length)<.0005)throw new Error('没有录到清晰声音，请检查麦克风和音量后再试。');
  return new Blob([bytes],{type:'audio/wav'});
 }
 const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('无法读取录音，请重新录制。'));reader.readAsDataURL(blob);});
 async function grade(){
  if(!wav||!session)return;setState('grading');status('正在识别录音并由模型判卷，通常需要一些时间，请保留此页面。');
  try{const result=await api('grade',{token:session.token,audio:await dataURL(wav),elapsed});renderResult(result);setState('done');status(`评分完成：${result.correct} 题正确，${result.incorrect} 题错误，${result.unanswered} 题未作答。`);}catch(error){failure(error);}
 }
 async function finishRecording(){
  if(state!=='recording')return;elapsed=Math.min(session.duration,(performance.now()-started)/1000);clearTimers();setState('encoding');status('正在结束录音并准备评分…');
  if(recorder?.state==='recording'){try{recorder.stop();}catch(error){failure(error);}}else failure(new Error('录音意外中断，请重新开始。'));
 }
 async function start(){
  if(busy())return;
  if(location.protocol==='file:'){status('录音评分需要在线服务，请打开已发布的应用地址。',true);return;}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'||typeof OfflineAudioContext==='undefined'){status('当前浏览器不支持录音，请使用 HTTPS 地址及最新版 Chrome、Edge 或 Safari。',true);return;}
  const token=++epoch;wav=null;session=null;elapsed=0;chunks=[];clearTimers();$('stroopResults').hidden=true;$('recordingPreview').hidden=true;$('stroopScore').textContent='—';$('stroopProgress').style.width='0';$('stroopCover').hidden=false;if(audioURL){URL.revokeObjectURL(audioURL);audioURL=null;$('stroopAudio').removeAttribute('src');}setState('preparing');status('正在准备题目，请允许浏览器使用麦克风。');
  try{
   audioContext=new(window.AudioContext||window.webkitAudioContext)();await audioContext.resume();
   session=await api('challenge',{duration:Number($('stroopDuration').value),count:Number($('stroopCount').value)});
   stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
   if(document.hidden||epoch!==token)throw new Error('准备过程已中断，请回到此页重新开始。');
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder.onerror=()=>{epoch++;failure(new Error('麦克风录音出现错误，请重新开始。'));};
   recorder.onstop=async()=>{stopTracks();if(epoch!==token)return;try{setState('encoding');const raw=new Blob(chunks,{type:recorder.mimeType});chunks=[];wav=await toWav(raw);await closeAudio();audioURL=URL.createObjectURL(wav);$('stroopAudio').src=audioURL;$('stroopDownload').href=audioURL;$('recordingPreview').hidden=false;await grade();}catch(error){failure(error);}};
   setState('countdown');if(matchMedia('(max-width:670px)').matches)$('stroopPanel').querySelector('.stroop-board').scrollIntoView({behavior:'smooth',block:'start'});for(let n=3;n>0;n--){if(document.hidden||token!==epoch)throw new Error('准备过程已中断，请回到此页重新开始。');$('stroopCover').querySelector('h2').textContent=`${n} · 准备读出颜色`;$('stroopTimer').textContent=clock(session.duration);await new Promise(resolve=>setTimeout(resolve,1000));}
   if(document.hidden||token!==epoch)throw new Error('准备过程已中断，请重新开始。');
   draw(session.items);$('stroopCover').hidden=true;recorder.start(1000);started=performance.now();setState('recording');status('正在录音。按编号依次说出颜色，全部读完可提前结束。');
   ticker=setInterval(()=>{const remaining=Math.max(0,session.duration-(performance.now()-started)/1000);$('stroopTimer').textContent=clock(remaining);$('stroopProgress').style.width=`${(1-remaining/session.duration)*100}%`;if(!remaining)void finishRecording();},100);
   stopTimer=setTimeout(()=>void finishRecording(),session.duration*1000);
  }catch(error){if(error.name==='NotAllowedError')error=new Error('麦克风权限被拒绝。请在浏览器地址栏允许麦克风后重试。');else if(error.name==='NotFoundError')error=new Error('没有找到麦克风，请连接设备后重试。');else if(error.name==='NotReadableError')error=new Error('麦克风无法使用，请检查是否被其他应用占用。');failure(error);}
 }
 function renderResult(result){
  $('stroopScore').textContent=result.score;$('stroopTimer').textContent=clock(Math.max(0,session.duration-elapsed));$('resultMetrics').replaceChildren();
  const metrics=[[result.score,'总分 / 100','score'],[result.correct,'正确题数',''],[result.incorrect,'错误题数',''],[result.unanswered,'未作答',''],[result.accuracy+'%','已答正确率',''],[result.perMinute,'每分钟正确题数','']];
  for(const [value,label,kind]of metrics){const card=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span');card.className='result-metric '+kind;b.textContent=value;s.textContent=label;card.append(b,s);$('resultMetrics').append(card);}
  $('stroopFeedback').textContent=result.feedback+(result.extra?` 另识别到 ${result.extra} 个超出题数的回答，不计分。`:'');$('stroopModel').textContent=result.model+' 判卷';$('stroopTranscript').textContent=result.transcript||'没有识别到回答。';$('stroopRows').replaceChildren();
  for(const row of result.rows){const tr=document.createElement('tr');for(const [index,value]of [row.index,row.word,row.expected+'色',row.heard?row.heard+'色':'—',({correct:'✓ 正确',incorrect:'× 错误',unanswered:'— 未作答'})[row.verdict]].entries()){const td=document.createElement('td');td.textContent=value;if(index===1)td.style.color=paint[row.expected];if(index===4)td.className='verdict-'+row.verdict;tr.append(td);}$('stroopRows').append(tr);}
  $('stroopResults').hidden=false;
  if(!saved.some(r=>r.id===session.id)){saved.unshift({id:session.id,at:Date.now(),score:result.score,correct:result.correct,total:result.total,duration:session.duration});saved=saved.slice(0,50);try{localStorage.setItem('number-garden-stroop-v1',JSON.stringify(saved));}catch{status('评分完成；当前浏览器无法保存历史成绩。');}records();}
 }
 $('stroopStart').onclick=start;$('stroopStop').onclick=finishRecording;$('stroopRetry').onclick=grade;$('stroopDuration').onchange=$('stroopCount').onchange=()=>{if(busy())return;wav=null;session=null;setState('idle');$('stroopScore').textContent='—';$('stroopResults').hidden=true;$('recordingPreview').hidden=true;setupPreview();$('stroopCover').querySelector('h2').textContent='看到字，读出颜色。';status('准备好麦克风，在安静的环境里开始。');};
 // Opening instructions must not obscure the timed task while the microphone is recording.
 $('helpBtn').addEventListener('click',()=>{if(state==='recording')void finishRecording();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='recording')void finishRecording();});
 window.addEventListener('beforeunload',event=>{if(busy()){event.preventDefault();event.returnValue='';}});
 window.addEventListener('pagehide',()=>{clearTimers();stopTracks();});
 setupPreview();records();
})();
