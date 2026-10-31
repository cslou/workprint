import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createArtifactStore, createMediaVerifier, createUploadCoordinator } from '../src/artifacts/index.js';
import { measureMediaProbe, parseMediaProbe, verifyDecodedFrames } from '../src/artifacts/uploads/media-probe.js';
import { createMediaSandbox, createPrivateObjectStorage } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { isolatedPostgres } from './postgres.js';
import { isolatedObjectStorage } from './object-storage.js';
import { applyArtifactMigrations } from './artifact-database.js';
import { createNativeConversation } from './native-conversations.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';
import { changingParameterFixture, entropyJpegFixture, postScanExif } from './media-adversarial-fixtures.js';

for(const attack of ['late-sps','post-scan-exif'] as const)test(`real ${attack} is decodable but cannot publish media or authority`,{timeout:90000},async t=>{
  const db=await isolatedPostgres();t.after(db.close);const service=await isolatedObjectStorage();t.after(service.close);
  const docker=await realpath('/usr/local/bin/docker'),sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});t.after(()=>sandbox.close());
  const native=new PostgresStore({id:'adversarial-media',connectionString:db.setupUrl,schemaName:'mastra'}),pool=new Pool({connectionString:db.servingUrl,max:2});
  const storage=createPrivateObjectStorage({endpoint:service.endpoint,bucket:service.bucket,region:'us-east-1',credentials:service.credentials});
  try{
    await native.init();await db.grantServing();await applyArtifactMigrations(db.setupUrl);
    const owner='adversarial-media-owner',conversation=(await createNativeConversation(native,owner)).id,owned=createOwnedConversationCheck(native);
    const fixtures=await qualifiedMediaFixtures(sandbox,docker),kind=attack==='late-sps'?'video':'image',contentType=kind==='video'?'video/mp4':'image/jpeg';
    let bytes:Buffer;
    if(attack==='late-sps'){
      const fixture=await changingParameterFixture(sandbox,docker,fixtures.png);bytes=fixture.bytes;
      const shape=measureMediaProbe(parseMediaProbe(fixture.initial),'video','video/mp4',bytes.length);
      assert.equal(shape.width,320);assert.equal(shape.height,180);assert.equal(shape.frames,216);assert.equal(shape.durationMs,9000);
      const frames=fixture.frames.toString().trim().split('\n');assert.equal(frames.filter(line=>line.startsWith('320,180,yuv420p')).length,192);assert.equal(frames.filter(line=>line.startsWith('1922,1080,yuv420p')).length,24);
      await sandbox.use(bytes,async job=>verifyDecodedFrames(await job.decode(),216,9000));
    }else{
      bytes=postScanExif(fixtures.jpeg);
      await sandbox.use(bytes,async job=>{assert.equal(measureMediaProbe(parseMediaProbe(await job.probe()),'image','image/jpeg',bytes.length).width,240);verifyDecodedFrames(await job.decode(),1);});
    }
    const uploads=createUploadCoordinator(pool,owned,{storage,verifyMedia:createMediaVerifier(sandbox)});
    const publish=async(body:Buffer)=>{
      const grant=await uploads.request(owner,conversation,{operationId:randomUUID(),kind,filename:kind==='video'?'synthetic.mp4':'synthetic.jpg',contentType,byteSize:body.length,intendedUse:{purpose:'reference'}});
      const put=await fetch(grant.url,{method:'PUT',headers:{'Content-Type':contentType},body:new Uint8Array(body),signal:AbortSignal.timeout(3000)});assert.equal(put.status,200);await put.body?.cancel();
      return uploads.confirm(owner,grant.uploadId,randomUUID());
    };
    await assert.rejects(publish(bytes),{code:'unsupported'});
    if(attack==='late-sps'){
      // Even a later geometry still within the overall limits is an unqualified parameter change.
      const changed=await changingParameterFixture(sandbox,docker,fixtures.png,'352x288');
      assert.ok(changed.frames.toString().includes('352,288,yuv420p'));
      await assert.rejects(publish(changed.bytes),{code:'unsupported'});
      for(const [atom,offset,value,code]of [['stsc',20,2,'unsupported'],['stsz',12,7201,'unsupported'],['stco',12,0xffffffff,'invalid_input']] as const){
        const malformed=Buffer.from(fixtures.video),at=malformed.indexOf(Buffer.from(atom));assert.ok(at>0);malformed.writeUInt32BE(value,at+offset);
        await assert.rejects(publish(malformed),{code});
      }
    }else{
      const icc=Buffer.from(bytes),app=icc.lastIndexOf(Buffer.from([255,225]));assert.ok(app>0);icc[app+1]=226;
      await assert.rejects(publish(icc),{code:'unsupported'});
    }
    const effects=(await pool.query('SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses,(SELECT count(*)::int FROM artifacts.manual_changes) AS approvals,(SELECT count(*)::int FROM artifacts.uploads WHERE confirmed_result IS NOT NULL) AS results')).rows;
    assert.deepEqual(effects,[{versions:0,pointers:0,uses:0,approvals:0,results:0}]);
    if(attack==='late-sps'){
      const repeated=await changingParameterFixture(sandbox,docker,fixtures.png,'320x180');
      assert.equal((await publish(repeated.bytes)).version.kind,'video','Identical repeated SPS/PPS are valid');
    }else{
      const entropy=await entropyJpegFixture(sandbox,docker,fixtures.png);
      assert.ok(entropy.includes(Buffer.from([255,221])));assert.ok(entropy.includes(Buffer.from([255,208])));assert.ok(entropy.includes(Buffer.from([255,0])));
      assert.equal((await publish(entropy)).version.kind,'image','Real restart and stuffed bytes remain decodable/qualified');
    }
    const good=await publish(kind==='video'?fixtures.video:fixtures.jpeg);assert.equal(good.version.createdBy,'human');assert.equal(good.use?.state,'draft');
    const reads=createArtifactStore(pool,owned);assert.ok((await reads.workspace(owner,conversation)).assets.some(work=>work.version.id===good.version.id));
  }finally{storage.close();await native.close();await pool.end();}
});
