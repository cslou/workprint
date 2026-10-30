import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createApiClient } from '@workprint/api-client';
import { createMediaSandbox } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { verifyBuiltAdmission } from './auth-built-fixture.js';
import { isolatedObjectStorage } from './object-storage.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';
import { createNativeConversation } from './native-conversations.js';
import { query } from './postgres.js';

const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('built production composition verifies actual media once and authorizes exact owned image/poster reads',{timeout:240000},async t=>{
  const service=await isolatedObjectStorage(undefined,message=>t.diagnostic(message));t.after(service.close);
  const media={toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:await realpath('/usr/local/bin/docker')};
  const sandbox=await createMediaSandbox(media);let fixtures:Awaited<ReturnType<typeof qualifiedMediaFixtures>>;try{fixtures=await qualifiedMediaFixtures(sandbox,media.dockerPath);}finally{await sandbox.close();}
  let conversation='';
  await verifyBuiltAdmission(t,async target=>{
    const client=createApiClient({baseUrl:target.origin,getAccessToken:async()=>target.accessTokens[0]!}),foreign=createApiClient({baseUrl:target.origin,getAccessToken:async()=>target.accessTokens[1]!});
    for(const [kind,bytes,contentType] of [['image',fixtures.png,'image/png'],['video',fixtures.video,'video/mp4']] as const){
      const grant=await client.requestUpload({params:{id:conversation},query:{},body:{operationId:randomUUID(),kind,filename:kind==='image'?'synthetic.png':'synthetic.mp4',contentType,byteSize:bytes.length,intendedUse:{purpose:'reference'}}});assert.ok(grant.ok);
      const put=await fetch(grant.value.url,{method:'PUT',headers:{'Content-Type':contentType},body:new Uint8Array(bytes),credentials:'omit',redirect:'error'});assert.equal(put.status,200);await put.body?.cancel();
      const command={params:{id:grant.value.uploadId},query:{},body:{operationId:randomUUID()}};
      const saved=await client.confirmUpload(command);assert.ok(saved.ok,'Actual supported bytes must replace the no-verifier501 with verified publication');assert.equal(saved.value.use?.state,'draft');assert.equal(saved.value.version.createdBy,'human');assert.deepEqual(await client.confirmUpload(command),saved);
      const request={params:{id:saved.value.version.id},query:{},body:{}};
      const denied=await foreign.media(request);assert.ok(!denied.ok);assert.equal(denied.error.code,'not_found');
      const access=await client.media(request);assert.ok(access.ok);assert.equal(access.value.measured.width,kind==='image'?240:320);assert.equal(access.value.measured.height,kind==='image'?240:180);
      const original=await fetch(access.value.url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});assert.equal(original.status,200);assert.equal(hash(new Uint8Array(await original.arrayBuffer())),hash(bytes));
      if(kind==='video'){assert.equal(access.value.measured.hasAudio,true);assert.equal(access.value.measured.durationMs,1000);assert.ok(access.value.poster);const poster=await fetch(access.value.poster,{credentials:'omit',referrerPolicy:'no-referrer'});assert.equal(poster.status,200);assert.equal(poster.headers.get('content-type'),'image/png');await poster.body?.cancel();}
      const raw=await fetch(`${target.origin}/v1/versions/${saved.value.version.id}/media`,{headers:{Authorization:`Bearer ${target.accessTokens[0]}`}});assert.equal(raw.headers.get('cache-control'),'no-store');await raw.body?.cancel();
    }
    const workspace=await client.workspace({params:{id:conversation},query:{},body:{}});assert.ok(workspace.ok);assert.equal(workspace.value.selectionRevision,0);
  },{media,storage:{endpoint:service.endpoint,bucket:service.bucket,region:'us-east-1',credentials:service.credentials},prepareSavedWork:async setup=>{conversation=(await createNativeConversation(setup.native,setup.accountIds[0]!)).id;},verifySavedEffects:async url=>{
    assert.deepEqual((await query(url,"SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.conversation_uses WHERE state='draft') AS drafts,(SELECT count(*)::int FROM artifacts.manual_changes) AS approvals")).rows,[{versions:2,pointers:2,drafts:2,approvals:0}]);
  }});
});
