import assert from 'node:assert/strict';
import { readFile,realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { configuredMediaSandbox,createMediaSandbox } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { runMediaChild } from '../src/storage/media/child.js';
import { ResourceMastra } from '../src/mastra/resources.js';

test('native shutdown closes active owned media work once before database disposal',{timeout:15000},async()=>{
  const docker=await realpath('/usr/local/bin/docker');const sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});
  let entered!:()=>void,id='',after=0,before=0;const ready=new Promise<void>(resolve=>{entered=resolve;});
  const pending=sandbox.use(await readFile('apps/web/test/fixtures/library-tile.png'),async job=>{id=job.resource.id;entered();await new Promise<void>(()=>{});});const settled=Promise.allSettled([pending]);
  const backend=new ResourceMastra({}, {before:async()=>{before++;await sandbox.close();},after:async()=>{after++;}});
  try{await Promise.race([ready,pending]);const first=backend.shutdown({drainTimeout:0});assert.equal(backend.shutdown(),first);await first;assert.equal(before,1);assert.equal(after,1);await assert.rejects(pending,{code:'cancelled'});assert.equal((await runMediaChild(docker,['ps','-a','--filter',`id=${id}`,'--format','{{.ID}}'],{timeoutMs:2000})).stdout.length,0);await assert.rejects(sandbox.use(new Uint8Array([1]),async()=>{}),{code:'unavailable'});}
  finally{await backend.shutdown();await settled;}
});

test('explicit media configuration and native cleanup failures fail closed without leaking diagnostics',async()=>{
  assert.equal(await configuredMediaSandbox({}),undefined);
  for(const input of [{MEDIA_DOCKER_PATH:'/usr/local/bin/docker'},{MEDIA_ARCHIVE_PATH:'/absent/retained-archive'},{MEDIA_TOOLCHAIN_DIRECTORY:'/absent/qualified-tools',MEDIA_DOCKER_PATH:'/usr/local/bin/docker'}])await assert.rejects(configuredMediaSandbox(input),{code:'unavailable'});
  let disposed=false;const backend=new ResourceMastra({}, {before:async()=>{throw new Error('private-sentinel-must-not-leak');},after:async()=>{disposed=true;}});
  await assert.rejects(backend.shutdown({drainTimeout:0}),error=>{assert.ok(error instanceof AggregateError);assert.equal(error.message,'Backend shutdown incomplete');assert.ok(!String(error.errors).includes('private-sentinel'));return true;});assert.equal(disposed,true);
});
