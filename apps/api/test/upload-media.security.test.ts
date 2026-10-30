import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { transferUpload } from '@workprint/api-client';
import { MAX_UPLOAD_VIDEO_BYTES } from '@workprint/contracts';
import { PostgresStore } from '@mastra/pg';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createArtifactStore, createUploadCoordinator, type MediaVerifier } from '../src/artifacts/index.js';
import { createMediaVerifier } from '../src/artifacts/uploads/media-verifier.js';
import { createMediaSandbox, createPrivateObjectStorage, type PrivateObjectStorage } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { isolatedPostgres, query } from './postgres.js';
import { isolatedObjectStorage } from './object-storage.js';
import { createNativeConversation } from './native-conversations.js';
import { applyArtifactMigrations } from './artifact-database.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';

const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
test('real bounded inspection and guarded PG/S3 publication preserve exact snapshots, authority, rollback and final fences',{timeout:180000},async t=>{
  const db=await isolatedPostgres();t.after(db.close);const service=await isolatedObjectStorage(undefined,message=>t.diagnostic(message));t.after(service.close);
  const docker=await realpath('/usr/local/bin/docker');const sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});t.after(()=>sandbox.close());
  const pool=new Pool({connectionString:db.servingUrl,max:4,application_name:'actual-media-publication',statement_timeout:2000});
  const control=new Pool({connectionString:db.setupUrl,max:1});
  const native=new PostgresStore({id:'actual-media-native',connectionString:db.setupUrl,schemaName:'mastra'});
  const objects=createPrivateObjectStorage({endpoint:service.endpoint,bucket:service.bucket,region:'us-east-1',credentials:service.credentials});
  try{
    await native.init();await db.grantServing();await applyArtifactMigrations(db.setupUrl);
    const account='actual-media-owner',conversation=(await createNativeConversation(native,account)).id,owned=createOwnedConversationCheck(native),reads=createArtifactStore(pool,owned);
    const script=await reads.insert({accountId:account,conversationId:conversation,kind:'script',createdBy:'human',dependencies:[],content:{schemaVersion:1,scenes:[{heading:{setting:'interior',location:'Station',time:'morning'},characters:[],script:[{action:'A traveller waits.'}]}]}});
    await reads.insert({accountId:account,conversationId:conversation,kind:'storyboard',createdBy:'human',dependencies:[script.id],content:{schemaVersion:1,sourceScriptVersionId:script.id,shots:[{shotId:'shot',order:0,intent:'Waiting.',panels:[{panelId:'panel',order:0,description:'Station clock.',references:[]}]}]},use:{binding:{purpose:'storyboard'},state:'approved'}});
    const fixtures=await qualifiedMediaFixtures(sandbox,docker);const actual=createMediaVerifier(sandbox);
    const outside=async()=>assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='actual-media-publication' AND state LIKE 'idle in transaction%'")).rows[0].n,0,'External media/storage work must not hold SQL transactions');
    let expectedPoster:Buffer|undefined,exposedPoster:Uint8Array|undefined;let reached:(()=>void)|undefined;let gate:Promise<void>|undefined;
    const inspect:MediaVerifier=async input=>{await outside();reached?.();if(gate)await gate;const result=await actual(input);input.bytes.fill(0);if(result.poster){expectedPoster=Buffer.from(result.poster.bytes);exposedPoster=result.poster.bytes;}await outside();return result;};
    const guarded:PrivateObjectStorage={...objects,read:async(...args)=>{await outside();return objects.read(...args);},publish:async(...args)=>{await outside();exposedPoster?.fill(9);return objects.publish(...args);}};
    const uploads=createUploadCoordinator(pool,owned,{storage:guarded,verifyMedia:inspect});
    const request=async(kind:'image'|'video')=>{const bytes=kind==='image'?fixtures.png:fixtures.video,contentType=kind==='image'?'image/png':'video/mp4';const grant=await uploads.request(account,conversation,{operationId:randomUUID(),filename:kind==='image'?'synthetic.png':'synthetic.mp4',kind,contentType,byteSize:bytes.length,intendedUse:kind==='image'?{purpose:'panel_image',shotId:'shot',panelId:'panel'}:{purpose:'shot_video',shotId:'shot'}});const put=async(body:Uint8Array)=>{const response=await fetch(grant.url,{method:'PUT',headers:{'Content-Type':contentType},body:new Uint8Array(body),signal:AbortSignal.timeout(3000)});await response.body?.cancel();assert.equal(response.status,200);};await put(bytes);return{grant,put,bytes};};
    const image=await request('image'),operation=randomUUID();
    const absent=createUploadCoordinator(pool,owned,{storage:objects});await assert.rejects(absent.confirm(account,image.grant.uploadId,operation),{code:'not_implemented'},'Actual missing capability baseline remains fail-closed');
    let release!:()=>void;const atInspection=new Promise<void>(resolve=>{reached=resolve;});gate=new Promise<void>(resolve=>{release=resolve;});
    const pending=uploads.confirm(account,image.grant.uploadId,operation);const observed=Promise.allSettled([pending]);
    try{await Promise.race([atInspection,pending]);await image.put(Buffer.alloc(image.bytes.length));release();const saved=await pending;assert.equal(saved.version.kind,'image');assert.equal(saved.version.createdBy,'human');assert.equal(saved.use?.state,'draft');assert.deepEqual(saved.version.dependencies.length,1);
      const pointer=(await pool.query('SELECT * FROM artifacts.media_objects WHERE version_id=$1',[saved.version.id])).rows[0];assert.equal(pointer.sha256,hash(image.bytes));assert.deepEqual((await objects.read(pointer.object_key)).bytes,image.bytes);assert.equal(pointer.poster_key,null);assert.deepEqual(await uploads.confirm(account,image.grant.uploadId,operation),saved);assert.ok(!JSON.stringify(saved).includes(pointer.object_key));
    }finally{release();await observed;gate=undefined;reached=undefined;}
    const video=await request('video'),videoOperation=randomUUID(),saved=await uploads.confirm(account,video.grant.uploadId,videoOperation);assert.equal(saved.version.kind,'video');assert.equal(saved.use?.state,'draft');
    if(saved.version.kind==='video'){assert.equal(saved.version.media.width,320);assert.equal(saved.version.media.height,180);assert.equal(saved.version.media.hasAudio,true);assert.equal(saved.version.media.durationMs,1000);}
    const pointer=(await pool.query('SELECT * FROM artifacts.media_objects WHERE version_id=$1',[saved.version.id])).rows[0];assert.equal(pointer.sha256,hash(video.bytes));assert.deepEqual((await objects.read(pointer.object_key)).bytes,video.bytes);assert.ok(expectedPoster);assert.equal(pointer.poster_sha256,hash(expectedPoster));assert.deepEqual((await objects.read(pointer.poster_key)).bytes,expectedPoster,'Poster was captured before the first publication await, not a mutable verifier alias');
    assert.deepEqual(await uploads.confirm(account,video.grant.uploadId,randomUUID()),saved);assert.equal((await reads.workspace(account,conversation)).selectionRevision,0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM artifacts.conversation_uses WHERE state='approved'")).rows[0].n,1,'Only the preexisting planning fixture is approved');assert.equal((await pool.query('SELECT count(*)::int AS n FROM artifacts.manual_changes')).rows[0].n,0);
    const effects=async()=>(await pool.query("SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.uploads WHERE confirmed_result IS NOT NULL) AS results,(SELECT revision::int FROM artifacts.publication_counters WHERE owner_id=$1) AS publication",[account])).rows;
    const before=await effects();
    await query(db.setupUrl,"CREATE FUNCTION artifacts.media_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned media rollback control'; END $$");
    await query(db.setupUrl,'CREATE TRIGGER media_failure AFTER INSERT ON artifacts.media_objects FOR EACH ROW EXECUTE FUNCTION artifacts.media_failure()');
    const failed=await request('video');try{await assert.rejects(uploads.confirm(account,failed.grant.uploadId,randomUUID()),{code:'integration_failure'});assert.deepEqual(await effects(),before);assert.deepEqual((await pool.query('SELECT count(*)::int AS refs,count(protected_version_id)::int AS protected FROM artifacts.upload_objects WHERE upload_id=$1',[failed.grant.uploadId])).rows,[{refs:3,protected:0}]);}finally{await query(db.setupUrl,'DROP TRIGGER media_failure ON artifacts.media_objects');await query(db.setupUrl,'DROP FUNCTION artifacts.media_failure()');}
    await uploads.cleanup(account,failed.grant.uploadId);
    // The real verifier has finished, reservation committed and actual candidate stored before replacement.
    let stored!:()=>void,resume!:()=>void,first=true;const atStored=new Promise<void>(resolve=>{stored=resolve;}),publishGate=new Promise<void>(resolve=>{resume=resolve;});
    const late=createUploadCoordinator(pool,owned,{storage:{...guarded,publish:async(...args)=>{const result=await guarded.publish(...args);if(first){first=false;stored();await publishGate;}return result;}},verifyMedia:inspect});
    const grant=await request('video'),completion=late.confirm(account,grant.grant.uploadId,randomUUID()),outcome=Promise.allSettled([completion]);
    try{await Promise.race([atStored,completion]);assert.equal((await pool.query('SELECT attempt_count FROM artifacts.uploads WHERE upload_id=$1',[grant.grant.uploadId])).rows[0].attempt_count,1);await control.query("UPDATE artifacts.uploads SET lease_token=$2,lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE upload_id=$1",[grant.grant.uploadId,randomUUID()]);const newer=(await pool.query('SELECT lease_token,lease_expires_at FROM artifacts.uploads WHERE upload_id=$1',[grant.grant.uploadId])).rows;resume();await assert.rejects(completion,{code:'integration_failure'});assert.deepEqual(await effects(),before);assert.deepEqual((await pool.query('SELECT lease_token,lease_expires_at FROM artifacts.uploads WHERE upload_id=$1',[grant.grant.uploadId])).rows,newer);const refs=(await pool.query('SELECT object_key,protected_version_id FROM artifacts.upload_objects WHERE upload_id=$1',[grant.grant.uploadId])).rows;assert.equal(refs.length,3);for(const ref of refs){assert.equal(ref.protected_version_id,null);assert.ok((await objects.read(ref.object_key)).byteSize>0);}}
    finally{resume();await outcome;}
    // Real exact-size MP4 padding, not synthetic metadata standing in for accepted bytes.
    const padded=Buffer.alloc(MAX_UPLOAD_VIDEO_BYTES);fixtures.video.copy(padded);padded.writeUInt32BE(padded.length-fixtures.video.length,fixtures.video.length);padded.write('free',fixtures.video.length+4,'ascii');const paddedHash=hash(padded);
    const large=await uploads.request(account,conversation,{operationId:randomUUID(),kind:'video',filename:'synthetic-padded.mp4',contentType:'video/mp4',byteSize:padded.length,intendedUse:{purpose:'shot_video',shotId:'shot'}});
    assert.ok((await transferUpload(large,new Blob([padded],{type:'video/mp4'}))).ok);
    const largeSaved=await uploads.confirm(account,large.uploadId,randomUUID());assert.equal(largeSaved.version.kind,'video');if(largeSaved.version.kind==='video')assert.equal(largeSaved.version.media.byteSize,MAX_UPLOAD_VIDEO_BYTES);
    const largePointer=(await pool.query('SELECT object_key,sha256 FROM artifacts.media_objects WHERE version_id=$1',[largeSaved.version.id])).rows[0];assert.equal(largePointer.sha256,paddedHash);assert.equal((await objects.read(largePointer.object_key)).sha256,paddedHash);assert.equal((await reads.workspace(account,conversation)).selectionRevision,0);
  }finally{objects.close();await native.close();await pool.end();await control.end();}
});
