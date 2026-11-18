// Recognition only fills the current page's draft. Never sends a message itself.
export function createVoiceInput({button,input,status,getKey,onText,toast,Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition,timers=globalThis}) {
  let current=null,disposed=false;
  const fallback='可在输入框按 Win + H 使用 Windows 语音输入，或直接打字。';
  const setRecording=recording=>{const label=recording?'停止录音':'语音输入';button.setAttribute('aria-pressed',String(recording));button.setAttribute('aria-label',label);button.setAttribute('title',label);};
  const idle=()=>{setRecording(false);input.readOnly=false;};
  const focus=()=>{if(!input.disabled&&!globalThis.document?.hidden)input.focus?.({preventScroll:true});};
  function release(session,abort=false){
    if(current!==session)return;
    current=null;timers.clearTimeout(session.timer);idle();
    if(abort)try{session.recognition?.abort();}catch{}
  }
  function cancel(){if(current)release(current,true);else idle();status.textContent='';}
  function fail(session,code){
    if(current!==session)return;
    const samePage=getKey()===session.key;
    release(session,true);
    if(!samePage)return;
    const messages={
      'not-allowed':'麦克风权限被拒绝。请允许浏览器使用麦克风，并检查 Windows 设置 → 隐私和安全性 → 麦克风中的访问权限。',
      'service-not-allowed':'浏览器未允许使用语音识别服务。',
      network:'浏览器语音服务连接失败；能正常聊天不代表语音服务也能连接。',
      'audio-capture':'无法使用麦克风，请检查输入设备及是否被其他程序占用。',
      'no-speech':'没有识别到声音，请检查麦克风后重试。',
      'language-not-supported':'当前浏览器语音服务不支持中文识别。',
      'start-timeout':'语音服务启动超时，请检查麦克风授权和网络连接。',
      'result-timeout':'语音服务未返回识别结果，已停止等待；已识别文字会保留。',
    };
    status.textContent=code==='aborted'?'':`${messages[code]||'语音识别未能启动或已中断。'}（${code}）${fallback}`;
    focus();
  }
  function waitFor(session,ms,code){timers.clearTimeout(session.timer);session.timer=timers.setTimeout(()=>fail(session,code),ms);}
  const errorCode=error=>({'NotAllowedError':'not-allowed','SecurityError':'not-allowed','NotFoundError':'audio-capture','NotReadableError':'audio-capture','NetworkError':'network'}[error?.name]||error?.name||'start-failed');
  function stop(session){
    if(current!==session||session.stopping)return;
    session.stopping=true;status.textContent='正在识别，请稍候…';waitFor(session,8000,'result-timeout');
    try{session.recognition.stop();}catch(error){fail(session,errorCode(error));}
  }
  function start(){
    if(disposed)return;
    if(current){stop(current);return;}
    const key=getKey();if(!key||input.disabled)return;
    if(!Recognition){status.textContent='当前浏览器不支持语音识别。'+fallback;focus();toast(status.textContent);return;}
    const session={key,prefix:input.value,recognition:null,timer:null,received:false,stopping:false};current=session;
    try{
      globalThis.speechSynthesis?.cancel();
      const recognition=new Recognition();session.recognition=recognition;
      recognition.lang='zh-CN';recognition.interimResults=true;recognition.continuous=false;
      input.readOnly=true;setRecording(true);status.textContent='正在启动语音服务，请允许使用麦克风…';
      const valid=()=>{if(current!==session)return false;if(getKey()!==key){cancel();return false;}return true;};
      recognition.onstart=()=>{if(!valid()||session.stopping)return;status.textContent='正在听… 识别后请核对文字再发送。';timers.clearTimeout(session.timer);session.timer=timers.setTimeout(()=>stop(session),60000);};
      recognition.onresult=event=>{
        if(!valid())return;
        let transcript='';for(const result of event.results)transcript+=result[0]?.transcript||'';
        if(!transcript.trim())return;
        session.received=true;
        const text=(session.prefix+(session.prefix?'\n':'')+transcript).slice(0,4000);input.value=text;onText(key,text);
      };
      recognition.onerror=event=>fail(session,event.error||'recognition-failed');
      recognition.onend=()=>{if(!valid())return;release(session);status.textContent=session.received?'录音已结束，请核对文字后发送。':'没有识别到文字，请检查麦克风后重试。'+fallback;focus();};
      waitFor(session,15000,'start-timeout');recognition.start();
    }catch(error){fail(session,errorCode(error));}
  }
  button.onclick=start;
  const onVisibility=()=>{if(globalThis.document?.hidden)cancel();};
  globalThis.document?.addEventListener('visibilitychange',onVisibility);
  return {cancel,dispose(){disposed=true;cancel();globalThis.document?.removeEventListener('visibilitychange',onVisibility);if(button.onclick===start)button.onclick=null;}};
}
