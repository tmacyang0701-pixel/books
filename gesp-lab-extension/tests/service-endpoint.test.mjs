import test from 'node:test';
import assert from 'node:assert/strict';
import {createServiceEndpoint} from '../ui/service-endpoint.js';

test('adopts alternate ready port and refreshes after a restart',async()=>{
 let port=8767,calls=0;
 const endpoint=createServiceEndpoint({extensionPage:true,defaultUrl:'http://127.0.0.1:8766',sendNative:async()=>{calls++;return{serviceUrl:`http://127.0.0.1:${port}`};}});
 assert.deepEqual(await Promise.all([endpoint(),endpoint()]),['http://127.0.0.1:8767','http://127.0.0.1:8767']);
 assert.equal(calls,1);port=8768;
 assert.equal(await endpoint(true),'http://127.0.0.1:8768');
});
test('rejects remote addresses and invalid ports; retains last working endpoint',async()=>{
 let url='http://127.0.0.1:8767';
 const endpoint=createServiceEndpoint({extensionPage:true,defaultUrl:'http://127.0.0.1:8766',sendNative:async()=>({serviceUrl:url})});
 await endpoint();
 for(url of ['https://example.com','http://127.0.0.1:0','http://127.0.0.1:99999','http://127.0.0.1:8767/path'])assert.equal(await endpoint(true),'http://127.0.0.1:8767');
});
test('native unavailable keeps default; web preview retains its origin',async()=>{
 const endpoint=createServiceEndpoint({extensionPage:true,defaultUrl:'http://127.0.0.1:8766',sendNative:async()=>{throw Error('not installed');}});
 assert.equal(await endpoint(),'http://127.0.0.1:8766');
 const preview=createServiceEndpoint({extensionPage:false,defaultUrl:'http://localhost:9000',sendNative:()=>{throw Error('must not call');}});
 assert.equal(await preview(),'http://localhost:9000');
});
