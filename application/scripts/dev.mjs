import http from 'node:http';
import {Readable} from 'node:stream';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
await import('./build.mjs');
const {default:worker}=await import('../dist/server/index.js');
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>8_000_000){res.writeHead(413).end();return;}chunks.push(chunk);}
  const request=new Request(`http://127.0.0.1:4173${req.url}`,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await worker.fetch(request,process.env,{});
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(!response.body){res.end();return;}
  const body=Readable.fromWeb(response.body);body.on('error',()=>res.destroy());body.pipe(res);res.on('close',()=>body.destroy());
 }catch{res.writeHead(500).end('Local server error');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
