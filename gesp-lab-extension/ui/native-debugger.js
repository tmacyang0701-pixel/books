export function createNativeDebugger(connect=()=>globalThis.chrome?.runtime?.connectNative('com.codearena.cpp_judge')) {
  let port=null,pending=null,generation=0;
  function close(){generation++;const old=port;port=null;if(pending){clearTimeout(pending.timer);pending.reject(Error('调试已停止'));pending=null;}old?.disconnect();}
  function request(payload){
    if(pending)return Promise.reject(Error('请等待当前调试操作完成'));
    if(!port){
      try{port=connect();}catch(error){return Promise.reject(error);}
      if(!port)return Promise.reject(Error('请从已安装的 Chrome 扩展打开调试功能'));
      const active=port;
      port.onMessage.addListener(result=>{if(active!==port||!pending)return;const task=pending;pending=null;clearTimeout(task.timer);result.error&&!result.status?task.reject(Error(result.error)):task.resolve(result);});
      port.onDisconnect.addListener(()=>{const detail=globalThis.chrome?.runtime?.lastError?.message;if(active!==port)return;port=null;if(pending){clearTimeout(pending.timer);pending.reject(Error(detail||'调试连接已断开，请重新开始'));pending=null;}});
    }
    return new Promise((resolve,reject)=>{
      pending={resolve,reject,timer:setTimeout(()=>close(),45000)};
      try{port.postMessage(payload);}catch(error){close();}
    });
  }
  async function start(code,input,breakpoints=[]){
    close();const token=generation,caps=await request({mode:'capabilities'});
    if(token!==generation)throw Error('调试已停止');
    if(!caps.capabilities?.includes('cppDebugger')){close();throw Error('本地组件尚未支持调试，请用新版一键安装更新组件');}
    if(!caps.debuggerAvailable){close();throw Error('未找到 GDB，请安装包含 GCC 和 GDB 的 Dev-C++');}
    return request({mode:'debug_start',code,input,breakpoints});
  }
  return {start,request,close};
}
