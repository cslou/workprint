import assert from 'node:assert/strict';
import { createServer,type RequestListener } from 'node:http';
import { test } from 'node:test';
import { privateVideoDeadlineMs, readPrivateImage, readPrivateVideo } from '../../src/index.js';

/** Controlled real HTTP peers prove transport bounds only, not media codec qualification. */
async function peer(handler:RequestListener){const server=createServer(handler);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');return{url:`http://127.0.0.1:${address.port}/image?X-Amz-Signature=synthetic-control`,close:async()=>{server.closeAllConnections();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}};}
test('private image transport omits credentials/referrer and validates actual length/type without redirect or retry',async()=>{
  let requests=0;const fixture=await peer((request,response)=>{requests++;assert.equal(request.headers.authorization,undefined);assert.equal(request.headers.cookie,undefined);assert.equal(request.headers.referer,undefined);if(request.url?.includes('redirect')){response.writeHead(302,{Location:'/image?X-Amz-Signature=synthetic-control'});response.end();}else{response.writeHead(200,{'Content-Type':'image/png','Content-Length':3});response.end('abc');}});
  try{const result=await readPrivateImage(fixture.url,new AbortController().signal);assert.ok(result.ok);assert.equal(await result.value.text(),'abc');assert.equal(result.value.type,'image/png');const redirected=await readPrivateImage(fixture.url+'&redirect=true',new AbortController().signal);assert.ok(!redirected.ok);assert.equal(requests,2,'Redirect and failure must not introduce a second request');}finally{await fixture.close();}
});
test('a completed private image response is not aborted after fully reading EOF',async t=>{
  const fixture=await peer((_request,response)=>{response.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':3});response.end('abc');});
  const actual=globalThis.fetch;let signal:AbortSignal|null|undefined;
  t.mock.method(globalThis,'fetch',(input:Parameters<typeof fetch>[0],options:Parameters<typeof fetch>[1])=>{signal=options?.signal;return actual(input,options);});
  try{const result=await readPrivateImage(fixture.url,new AbortController().signal);assert.ok(result.ok);assert.equal(await result.value.text(),'abc');assert.equal(signal?.aborted,false,'Successful EOF must not emit a late transport cancellation');}finally{await fixture.close();}
});
test('private image rejects unqualified content and oversized declarations before exposing bytes',async()=>{
  for(const headers of [{'Content-Type':'image/svg+xml','Content-Length':3},{'Content-Type':'image/png','Content-Length':10*1024**2+1}]){const fixture=await peer((_request,response)=>{response.writeHead(200,headers);response.end('abc');});try{assert.ok(!(await readPrivateImage(fixture.url,new AbortController().signal)).ok);}finally{await fixture.close();}}
});
test('past two stalled image reads a third waits its turn, and leaving the queue sends nothing',{timeout:15000},async()=>{
  let requests=0,reached!:()=>void;const ready=new Promise<void>(r=>{reached=r;});const fixture=await peer((request,response)=>{if(++requests===2)reached();response.writeHead(200,{'Content-Type':'image/png','Content-Length':3});if(request.url?.includes('quick'))response.end('abc');else{response.flushHeaders();response.write('a');}});
  try{
    const stalled=new AbortController(),first=readPrivateImage(fixture.url,stalled.signal),second=readPrivateImage(fixture.url,new AbortController().signal);await ready;
    const leaving=new AbortController(),left=readPrivateImage(fixture.url+'&quick=true',leaving.signal),third=readPrivateImage(fixture.url+'&quick=true',new AbortController().signal);
    leaving.abort();assert.ok(!(await left).ok);assert.equal(requests,2,'a queued read that leaves is never sent');
    stalled.abort();const done=await third;assert.ok(done.ok,'the waiting read runs once a slot frees');assert.equal(await done.value.text(),'abc');assert.equal(requests,3);
    assert.ok(!(await first).ok);assert.ok(!(await second).ok,'a stalled read still settles on its fixed deadline');
  }finally{await fixture.close();}
});
test('private video download requires the exact version type and byte size, holds one slot and scales its deadline',async()=>{
  for(const [headers,body] of [[{'Content-Type':'video/webm','Content-Length':3},'abc'],[{'Content-Type':'video/mp4','Content-Length':4},'abcd'],[{'Content-Type':'video/mp4','Content-Length':3},'ab']] as const){
    const fixture=await peer((_request,response)=>{response.writeHead(200,headers);response.end(body);});
    try{assert.ok(!(await readPrivateVideo(fixture.url,new AbortController().signal,{contentType:'video/mp4',byteSize:3})).ok);}finally{await fixture.close();}
  }
  let reached!:()=>void;const ready=new Promise<void>(r=>{reached=r;});
  const fixture=await peer((request,response)=>{assert.equal(request.headers.authorization,undefined);assert.equal(request.headers.referer,undefined);response.writeHead(200,{'Content-Type':'video/mp4','Content-Length':3});if(request.url?.includes('stall')){response.flushHeaders();response.write('a');reached();}else response.end('abc');});
  try{
    const ok=await readPrivateVideo(fixture.url,new AbortController().signal,{contentType:'video/mp4',byteSize:3});assert.ok(ok.ok);assert.equal(await ok.value.text(),'abc');
    const controller=new AbortController(),stalled=readPrivateVideo(fixture.url+'&stall=true',controller.signal,{contentType:'video/mp4',byteSize:3});await ready;
    const waiting=readPrivateVideo(fixture.url,new AbortController().signal,{contentType:'video/mp4',byteSize:3});
    controller.abort();assert.ok(!(await stalled).ok);
    assert.ok((await waiting).ok,'One download at a time: the next waits for the slot');
  }finally{await fixture.close();}
  assert.equal(privateVideoDeadlineMs(1),61000);assert.equal(privateVideoDeadlineMs(100*1024**2),860000);
});
