import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { uploadRecords } from '../src/artifacts/uploads/records.js';
import { createApiClient } from '@workprint/api-client';
import { createMediaSandbox } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { verifyBuiltAdmission } from './auth-built-fixture.js';
import { isolatedObjectStorage } from './object-storage.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';
import { createNativeConversation } from './native-conversations.js';
import { query } from './postgres.js';

const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('built composition rejects video including stored grants while JPEG/PNG publication and exact owned reads work',{timeout:240000},async t=>{
  const service=await isolatedObjectStorage(undefined,message=>t.diagnostic(message));t.after(service.close);
  const media={toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:await realpath('/usr/local/bin/docker')};
  const sandbox=await createMediaSandbox(media);let fixtures:Awaited<ReturnType<typeof qualifiedMediaFixtures>>;try{fixtures=await qualifiedMediaFixtures(sandbox,media.dockerPath);}finally{await sandbox.close();}
  let conversation='',oldVideo='';
  await verifyBuiltAdmission(t,async target=>{
    const client=createApiClient({baseUrl:target.origin,getAccessToken:async()=>target.accessTokens[0]!}),foreign=createApiClient({baseUrl:target.origin,getAccessToken:async()=>target.accessTokens[1]!});
    const videoRequest={params:{id:conversation},query:{},body:{operationId:randomUUID(),kind:'video' as const,filename:'ordinary.mp4',contentType:'video/mp4',byteSize:fixtures.video.length,intendedUse:{purpose:'reference' as const}}};
    const rejected=await client.requestUpload(videoRequest);assert.ok(!rejected.ok);assert.equal(rejected.error.code,'unsupported');
    const hidden=await foreign.requestUpload(videoRequest);assert.ok(!hidden.ok);assert.equal(hidden.error.code,'not_found');
    const oldCommand={params:{id:oldVideo},query:{},body:{operationId:randomUUID()}};
    const old=await client.confirmUpload(oldCommand);assert.ok(!old.ok);assert.equal(old.error.code,'unsupported');
    const hiddenOld=await foreign.confirmUpload(oldCommand);assert.ok(!hiddenOld.ok);assert.equal(hiddenOld.error.code,'not_found');
    const anonymous=await fetch(`${target.origin}/v1/uploads/${oldVideo}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(oldCommand.body)});assert.equal(anonymous.status,401);assert.deepEqual(await anonymous.json(),{error:{code:'unauthenticated',message:'Authentication required'}});
    for(const [kind,bytes,contentType] of [['image',fixtures.png,'image/png'],['image',fixtures.jpeg,'image/jpeg']] as const){
      const grant=await client.requestUpload({params:{id:conversation},query:{},body:{operationId:randomUUID(),kind,filename:contentType==='image/png'?'synthetic.png':'synthetic.jpg',contentType,byteSize:bytes.length,intendedUse:{purpose:'reference'}}});assert.ok(grant.ok);
      const put=await fetch(grant.value.url,{method:'PUT',headers:{'Content-Type':contentType},body:new Uint8Array(bytes),credentials:'omit',redirect:'error'});assert.equal(put.status,200);await put.body?.cancel();
      const command={params:{id:grant.value.uploadId},query:{},body:{operationId:randomUUID()}};
      const saved=await client.confirmUpload(command);assert.ok(saved.ok,'Actual supported bytes must replace the no-verifier501 with verified publication');assert.equal(saved.value.use?.state,'draft');assert.equal(saved.value.version.createdBy,'human');assert.deepEqual(await client.confirmUpload(command),saved);
      const request={params:{id:saved.value.version.id},query:{},body:{}};
      const denied=await foreign.media(request);assert.ok(!denied.ok);assert.equal(denied.error.code,'not_found');
      const access=await client.media(request);assert.ok(access.ok);assert.equal(access.value.measured.width,240);assert.equal(access.value.measured.height,240);assert.equal(access.value.poster,undefined);
      const original=await fetch(access.value.url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});assert.equal(original.status,200);assert.equal(hash(new Uint8Array(await original.arrayBuffer())),hash(bytes));
      const raw=await fetch(`${target.origin}/v1/versions/${saved.value.version.id}/media`,{headers:{Authorization:`Bearer ${target.accessTokens[0]}`}});assert.equal(raw.headers.get('cache-control'),'no-store');await raw.body?.cancel();
    }
    const workspace=await client.workspace({params:{id:conversation},query:{},body:{}});assert.ok(workspace.ok);assert.equal(workspace.value.selectionRevision,0);
  },{media,storage:{endpoint:service.endpoint,bucket:service.bucket,region:'us-east-1',credentials:service.credentials},prepareSavedWork:async setup=>{const account=setup.accountIds[0]!;conversation=(await createNativeConversation(setup.native,account)).id;const pool=new Pool({connectionString:setup.servingUrl,max:1});try{oldVideo=(await uploadRecords(pool).request(account,conversation,{operationId:randomUUID(),kind:'video',filename:'ordinary.mp4',contentType:'video/mp4',byteSize:fixtures.video.length,intendedUse:{purpose:'reference'}},null)).upload_id;}finally{await pool.end();}},verifySavedEffects:async url=>{
    assert.deepEqual((await query(url,"SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.conversation_uses WHERE state='draft') AS drafts,(SELECT count(*)::int FROM artifacts.manual_changes) AS approvals")).rows,[{versions:2,pointers:2,drafts:2,approvals:0}]);
    assert.deepEqual((await query(url,"SELECT count(*)::int AS confirmations FROM artifacts.upload_confirmations WHERE upload_id IN (SELECT upload_id FROM artifacts.uploads WHERE kind='video')")).rows,[{confirmations:0}]);
  }});
});
