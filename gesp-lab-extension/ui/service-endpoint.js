// The native component reports only this installation's ready loopback endpoint.
export function createServiceEndpoint({sendNative,defaultUrl,extensionPage,now=Date.now}) {
  let current=defaultUrl,checked=-Infinity,pending=null;
  return async function endpoint(refresh=false) {
    if(!extensionPage)return current;
    if(pending)return pending;
    if(!refresh&&now()-checked<2000)return current;
    pending=(async()=>{
      try {
        const result=await sendNative({mode:'capabilities'});
        const match=/^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(result?.serviceUrl||'');
        if(match&&Number(match[1])>=1024&&Number(match[1])<=65535)current=result.serviceUrl;
      } catch { /* Keep the last endpoint if the native component is unavailable. */ }
      checked=now();return current;
    })();
    try{return await pending;}finally{pending=null;}
  };
}
