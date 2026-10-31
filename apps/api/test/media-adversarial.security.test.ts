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
import { entropyJpegFixture, postScanExif } from './media-adversarial-fixtures.js';

// Video publication controls are superseded by upload-image-only.security.test.ts.
// The MP4 defect is deferred; this retained regression exercises JPEG only.
test('real post-scan-exif is decodable but cannot publish media or authority',{timeout:90000},async t=>{
  const db=await isolatedPostgres();t.after(db.close);const service=await isolatedObjectStorage();t.after(service.close);
  const docker=await realpath('/usr/local/bin/docker'),sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});t.after(()=>sandbox.close());
  const native=new PostgresStore({id:'adversarial-media',connectionString:db.setupUrl,schemaName:'mastra'}),pool=new Pool({connectionString:db.servingUrl,max:2});
  const storage=createPrivateObjectStorage({endpoint:service.endpoint,bucket:service.bucket,region:'us-east-1',credentials:service.credentials});
  try{
    await native.init();await db.grantServing();await applyArtifactMigrations(db.setupUrl);
    const owner='adversarial-media-owner',conversation=(await createNativeConversation(native,owner)).id,owned=createOwnedConversationCheck(native);
    const fixtures=await qualifiedMediaFixtures(sandbox,docker),kind='image',contentType='image/jpeg';
    const bytes=postScanExif(fixtures.jpeg);
    await sandbox.use(bytes,async job=>{assert.equal(measureMediaProbe(parseMediaProbe(await job.probe()),'image','image/jpeg',bytes.length).width,240);verifyDecodedFrames(await job.decode(),1);});
    const uploads=createUploadCoordinator(pool,owned,{storage,verifyMedia:createMediaVerifier(sandbox)});
    const publish=async(body:Buffer)=>{
      const grant=await uploads.request(owner,conversation,{operationId:randomUUID(),kind,filename:'synthetic.jpg',contentType,byteSize:body.length,intendedUse:{purpose:'reference'}});
      const put=await fetch(grant.url,{method:'PUT',headers:{'Content-Type':contentType},body:new Uint8Array(body),signal:AbortSignal.timeout(3000)});assert.equal(put.status,200);await put.body?.cancel();
      return uploads.confirm(owner,grant.uploadId,randomUUID());
    };
    await assert.rejects(publish(bytes),{code:'unsupported'});
    const icc=Buffer.from(bytes),app=icc.lastIndexOf(Buffer.from([255,225]));assert.ok(app>0);icc[app+1]=226;
    await assert.rejects(publish(icc),{code:'unsupported'});
    const effects=(await pool.query('SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses,(SELECT count(*)::int FROM artifacts.manual_changes) AS approvals,(SELECT count(*)::int FROM artifacts.uploads WHERE confirmed_result IS NOT NULL) AS results')).rows;
    assert.deepEqual(effects,[{versions:0,pointers:0,uses:0,approvals:0,results:0}]);
    const entropy=await entropyJpegFixture(sandbox,docker,fixtures.png);
    assert.ok(entropy.includes(Buffer.from([255,221])));assert.ok(entropy.includes(Buffer.from([255,208])));assert.ok(entropy.includes(Buffer.from([255,0])));
    assert.equal((await publish(entropy)).version.kind,'image','Real restart and stuffed bytes remain decodable/qualified');
    const good=await publish(fixtures.jpeg);assert.equal(good.version.createdBy,'human');assert.equal(good.use?.state,'draft');
    const reads=createArtifactStore(pool,owned);assert.ok((await reads.workspace(owner,conversation)).assets.some(work=>work.version.id===good.version.id));
  }finally{storage.close();await native.close();await pool.end();}
});
