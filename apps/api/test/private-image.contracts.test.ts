import assert from 'node:assert/strict';
import { createServer,type RequestListener } from 'node:http';
import { test } from 'node:test';
import { readPrivateImage } from '@workprint/api-client';

/** Controlled real HTTP peers prove transport bounds only, not media codec qualification. */
async function peer(handler:RequestListener){const server=createServer(handler);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');return{url:`http://127.0.0.1:${address.port}/image?X-Amz-Signature=synthetic-control`,close:async()=>{server.closeAllConnections();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}};}
test('private image transport omits credentials/referrer and validates actual length/type without redirect or retry',async()=>{
  let requests=0;const fixture=await peer((request,response)=>{requests++;assert.equal(request.headers.authorization,undefined);assert.equal(request.headers.cookie,undefined);assert.equal(request.headers.referer,undefined);if(request.url?.includes('redirect')){response.writeHead(302,{Location:'/image?X-Amz-Signature=synthetic-control'});response.end();}else{response.writeHead(200,{'Content-Type':'image/png','Content-Length':3});response.end('abc');}});
  try{const result=await readPrivateImage(fixture.url,new AbortController().signal);assert.ok(result.ok);assert.equal(await result.value.text(),'abc');assert.equal(result.value.type,'image/png');const redirected=await readPrivateImage(fixture.url+'&redirect=true',new AbortController().signal);assert.ok(!redirected.ok);assert.equal(requests,2,'Redirect and failure must not introduce a second request');}finally{await fixture.close();}
});
test('private image rejects unqualified content and oversized declarations before exposing bytes',async()=>{
  for(const headers of [{'Content-Type':'image/svg+xml','Content-Length':3},{'Content-Type':'image/png','Content-Length':10*1024**2+1}]){const fixture=await peer((_request,response)=>{response.writeHead(200,headers);response.end('abc');});try{assert.ok(!(await readPrivateImage(fixture.url,new AbortController().signal)).ok);}finally{await fixture.close();}}
});
test('two stalled real image responses retain bounded capacity, reject a third and settle on the fixed deadline',{timeout:15000},async()=>{
  let requests=0,reached!:()=>void;const ready=new Promise<void>(r=>{reached=r;});const fixture=await peer((_request,response)=>{if(++requests===2)reached();response.writeHead(200,{'Content-Type':'image/png','Content-Length':3});response.flushHeaders();response.write('a');});
  try{const first=readPrivateImage(fixture.url,new AbortController().signal),second=readPrivateImage(fixture.url,new AbortController().signal);await ready;assert.ok(!(await readPrivateImage(fixture.url,new AbortController().signal)).ok);assert.equal(requests,2);const results=await Promise.all([first,second]);assert.ok(results.every(r=>!r.ok));assert.equal(requests,2);}finally{await fixture.close();}
});
