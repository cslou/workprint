import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { transferUpload } from '@workprint/api-client';
import { parseUploadRequest } from '../src/artifacts/uploads/policy.js';
import { createPrivateObjectStorage, MAX_OBJECT_BYTES } from '../src/storage/index.js';

const VIDEO=100*1024**2,IMAGE=10*1024**2;
test('isolated100MiB transport ceiling is not video upload authorization; one byte over initiates nothing',{timeout:15000},async()=>{
  let requests=0,received=0;
  const server=createServer(async(request,response)=>{requests++;assert.equal(request.headers.authorization,undefined);assert.equal(request.headers.cookie,undefined);for await(const chunk of request)received+=(chunk as Buffer).length;response.writeHead(200);response.end();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address && typeof address!=='string');
  const grant={uploadId:'owned-size-boundary',url:`http://127.0.0.1:${address.port}/staging/boundary?X-Amz-Signature=owned-local-control`,expiresAt:new Date(Date.now()+60000).toISOString(),maxBytes:VIDEO};
  const file=new Blob([Buffer.alloc(VIDEO)],{type:'video/mp4'});
  try{const over=await transferUpload({...grant,maxBytes:VIDEO+1},new Blob([file,new Uint8Array([0])],{type:'video/mp4'}));assert.ok(!over.ok);assert.equal(over.error.code,'invalid_input');assert.equal(requests,0);
    const exact=await transferUpload(grant,file);assert.ok(exact.ok,'The100MiB transport boundary must be admitted, not the old64MiB cap');assert.equal(received,VIDEO);assert.equal(requests,1);
  }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('image-only policy retains10MiB while isolated mechanical storage stays bounded to100MiB',async()=>{
  const body={operationId:'size-control',kind:'video' as const,filename:'synthetic.mp4',contentType:'video/mp4',byteSize:VIDEO};
  assert.throws(()=>parseUploadRequest('owned-conversation',body),{code:'unsupported'});assert.equal(MAX_OBJECT_BYTES,VIDEO);
  assert.throws(()=>parseUploadRequest('owned-conversation',{...body,byteSize:VIDEO+1}),{code:'unsupported'});
  assert.equal(parseUploadRequest('owned-conversation',{...body,kind:'image',filename:'synthetic.png',contentType:'image/png',byteSize:IMAGE}).byteSize,IMAGE);
  assert.throws(()=>parseUploadRequest('owned-conversation',{...body,kind:'image',contentType:'image/png',byteSize:IMAGE+1}),{code:'unsupported'});
  const storage=createPrivateObjectStorage({endpoint:'http://127.0.0.1:1',bucket:'owned-size-control',region:'us-east-1',credentials:{accessKeyId:'owned-synthetic-key',secretAccessKey:'owned-synthetic-secret'}});
  const issuedAt=new Date(),expiresAt=new Date(issuedAt.getTime()+60000);
  try{assert.ok(await storage.presignPut({key:'staging/size-control',byteSize:VIDEO,contentType:'video/mp4',issuedAt,expiresAt}));await assert.rejects(storage.presignPut({key:'staging/size-control',byteSize:VIDEO+1,contentType:'video/mp4',issuedAt,expiresAt}),{code:'invalid_object'});}finally{storage.close();}
});
