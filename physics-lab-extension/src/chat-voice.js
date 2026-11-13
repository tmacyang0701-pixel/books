// Recognition only fills the current page's draft. Never sends a message itself.
export function createVoiceInput({button,input,status,getKey,onText,toast,Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition}) {
  let current=null;
  const setRecording=recording=>{const label=recording?'停止录音':'语音输入';button.setAttribute('aria-pressed',String(recording));button.setAttribute('aria-label',label);button.setAttribute('title',label);};
  const idle=()=>{setRecording(false);input.readOnly=false;};
  function cancel(){const previous=current;current=null;try{previous?.abort();}catch{}idle();status.textContent='';}
  button.onclick=()=>{
    if(current){try{current.stop();}catch{cancel();}return;}
    if(!Recognition){toast('当前浏览器不支持语音识别。可点输入框后按 Win + H 使用 Windows 语音输入。');return;}
    const key=getKey();if(!key||input.disabled)return;
    globalThis.speechSynthesis?.cancel();
    const recognition=new Recognition(),prefix=input.value;
    current=recognition;recognition.lang='zh-CN';recognition.interimResults=true;recognition.continuous=false;
    input.readOnly=true;setRecording(true);status.textContent='正在听… 使用浏览器语音服务，文字可修改后发送。';
    recognition.onresult=event=>{
      if(current!==recognition||getKey()!==key)return;
      let transcript='';for(const result of event.results)transcript+=result[0].transcript;
      const text=(prefix+(prefix?'\n':'')+transcript).slice(0,4000);input.value=text;onText(key,text);
    };
    recognition.onerror=event=>{
      if(current!==recognition)return;
      const messages={'not-allowed':'请允许此页面使用麦克风后重试。','service-not-allowed':'浏览器未允许语音服务，可改用 Win + H。',network:'语音服务连接失败，可点输入框后按 Win + H。','audio-capture':'未找到可用麦克风，请检查设备。','no-speech':'没有听到声音，请再试一次。'};
      status.textContent=event.error==='aborted'?'':(messages[event.error]||'语音识别失败，请重试或直接输入。');
      current=null;idle();try{recognition.abort();}catch{}
    };
    recognition.onend=()=>{if(current!==recognition)return;current=null;idle();if(status.textContent.startsWith('正在听'))status.textContent='录音已结束，请核对文字后发送。';};
    try{recognition.start();}catch{cancel();toast('无法启动麦克风，请检查权限或使用 Win + H。');}
  };
  const onVisibility=()=>{if(document.hidden)cancel();};
  globalThis.document?.addEventListener('visibilitychange',onVisibility);
  return {cancel,dispose(){cancel();globalThis.document?.removeEventListener('visibilitychange',onVisibility);}};
}
