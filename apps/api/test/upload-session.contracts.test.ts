import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUploadSession,type ApiClient,type ClientResult } from '@workprint/api-client';
import type { OperationRequest,OperationResponse } from '@workprint/contracts';

const file=()=>new File(['abc'],'synthetic.png',{type:'image/png'});
const saved:OperationResponse<'confirmUpload'>={version:{id:'saved-media',artifactId:'media-artifact',revision:1,kind:'image',media:{contentType:'image/png',byteSize:3,width:1,height:1},createdBy:'human',createdAt:'2026-10-30T00:00:00Z',dependencies:[]},use:{id:'media-use',versionId:'saved-media',binding:{purpose:'reference'},state:'draft'}};
const grant={uploadId:'owned-upload',url:'http://127.0.0.1:1/staging/owned?X-Amz-Signature=synthetic',maxBytes:3,expiresAt:'2099-01-01T00:00:00.000Z'};
const failure={ok:false as const,error:{code:'transport_failure' as const,message:'Controlled response loss'}};
test('single-file lifecycle retains original commands and bytes through grant and confirmation response loss',async()=>{
  const requests:OperationRequest<'requestUpload'>[]=[],confirmations:OperationRequest<'confirmUpload'>[]=[];let transfers=0;
  const client:Pick<ApiClient,'requestUpload'|'confirmUpload'>={requestUpload:async input=>{requests.push(input);return requests.length===1?failure:{ok:true,value:grant};},confirmUpload:async input=>{confirmations.push(input);return confirmations.length===1?failure:{ok:true,value:saved};}};
  const session=createUploadSession(async(_grant,body)=>{assert.equal(await body.text(),'abc');transfers++;return{ok:true,value:{acknowledged:true}};});
  session.configure({accountId:'owner',conversationId:'conversation'},client);assert.equal(requests.length,0);
  await session.select(file());assert.equal(session.getSnapshot().phase,'stopped');await session.retry();assert.equal(session.getSnapshot().phase,'interrupted');assert.equal(transfers,0);assert.deepEqual(requests[1],requests[0]);
  await session.retry();assert.equal(session.getSnapshot().phase,'unknown');assert.equal(transfers,1);await session.retry();assert.equal(session.getSnapshot().phase,'saved');assert.deepEqual(confirmations[1],confirmations[0]);assert.equal(requests.length,2);assert.equal(transfers,1);
  session.close();assert.equal(session.getSnapshot().file,null);session.dispose();
});

test('scope teardown and observer stop suppress late success without claiming rollback or replaying work',async()=>{
  let resolve!: (result:ClientResult<OperationResponse<'confirmUpload'>>)=>void,entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;});let confirmations=0;
  const client:Pick<ApiClient,'requestUpload'|'confirmUpload'>={requestUpload:async()=>({ok:true,value:grant}),confirmUpload:async()=>{confirmations++;entered();return new Promise(r=>{resolve=r;});}};
  const session=createUploadSession(async()=>({ok:true,value:{acknowledged:true}}));session.configure({accountId:'owner',conversationId:'first'},client);
  const pending=session.select(file());await ready;await session.select(new File(['different'],'other.png',{type:'image/png'}));assert.equal(session.getSnapshot().file?.name,'synthetic.png','No queued replacement');
  session.stop();assert.equal(session.getSnapshot().phase,'stopped');resolve({ok:true,value:saved});await pending;assert.equal(session.getSnapshot().saved,null);assert.equal(confirmations,1);
  session.configure({accountId:'other',conversationId:'second'},client);assert.equal(session.getSnapshot().phase,'scope-cleared');assert.equal(session.getSnapshot().file,null);assert.equal(session.getSnapshot().saved,null);await session.retry();assert.equal(confirmations,1);session.dispose();
});

test('preflight rejection has zero network effects and expired access requires explicit new authorization',async()=>{
  let calls=0,transfers=0;const operations:string[]=[];
  const client:Pick<ApiClient,'requestUpload'|'confirmUpload'>={requestUpload:async input=>{calls++;operations.push(input.body.operationId);return{ok:true,value:{...grant,expiresAt:calls===1?'2000-01-01T00:00:00.000Z':grant.expiresAt}};},confirmUpload:async()=>({ok:true,value:saved})};
  const session=createUploadSession(async()=>{transfers++;return{ok:true,value:{acknowledged:true}};});session.configure({accountId:'owner',conversationId:'conversation'},client);
  await session.select(new File(['x'],'unqualified.svg',{type:'image/svg+xml'}));assert.equal(session.getSnapshot().phase,'rejected-format');assert.equal(calls,0);
  await session.select(new File([],'empty.png',{type:'image/png'}));assert.equal(session.getSnapshot().phase,'rejected-damaged');assert.equal(calls,0);
  await session.select(file());assert.equal(session.getSnapshot().phase,'expired');assert.equal(transfers,0);await session.retry();assert.equal(calls,1);await session.authorizeAgain();assert.equal(session.getSnapshot().phase,'saved');assert.notEqual(operations[0],operations[1]);assert.equal(transfers,1);session.dispose();
});

test('video selection is refused locally and cannot replay authorization, transfer or confirmation',async()=>{
  let authorizations=0,transfers=0,confirmations=0;
  const session=createUploadSession(async()=>{transfers++;return{ok:true,value:{acknowledged:true}};});
  session.configure({accountId:'owner',conversationId:'conversation'},{requestUpload:async()=>{authorizations++;return{ok:true,value:grant};},confirmUpload:async()=>{confirmations++;return{ok:true,value:saved};}});
  for(const type of ['video/mp4','video/webm']){
    await session.select(new File(['abc'],'ordinary-clip.mp4',{type}));
    assert.equal(session.getSnapshot().phase,'rejected-format');assert.equal(session.getSnapshot().file?.kind,'video');
    await session.retry();await session.authorizeAgain();
    assert.deepEqual({authorizations,transfers,confirmations},{authorizations:0,transfers:0,confirmations:0});
  }
  session.dispose();
});

test('confirmation failure never claims bytes were not sent or that prior unknown work was rolled back',async()=>{
  const build=(code:'not_implemented'|'unauthenticated',grantFailure=false)=>{
    const client:Pick<ApiClient,'requestUpload'|'confirmUpload'>={requestUpload:async()=>grantFailure?{ok:false,error:{code,message:'Controlled grant rejection'}}:{ok:true,value:grant},confirmUpload:async()=>({ok:false,error:{code,message:'Controlled confirmation rejection'}})};
    const session=createUploadSession(async()=>({ok:true,value:{acknowledged:true}}));session.configure({accountId:'owner',conversationId:'conversation'},client);return session;
  };
  const absent=build('not_implemented');await absent.select(file());assert.equal(absent.getSnapshot().confirmationStarted,true);assert.equal(absent.getSnapshot().phase,'blocked');absent.dispose();
  const unknown=build('unauthenticated');await unknown.select(file());assert.equal(unknown.getSnapshot().phase,'unknown');assert.equal(unknown.getSnapshot().confirmationStarted,true);unknown.dispose();
  const denied=build('unauthenticated',true);await denied.select(file());assert.equal(denied.getSnapshot().phase,'blocked');assert.equal(denied.getSnapshot().confirmationStarted,false);denied.dispose();
});
