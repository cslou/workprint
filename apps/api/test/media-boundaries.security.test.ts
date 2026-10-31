import assert from 'node:assert/strict';
import { readFile,realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createMediaSandbox } from '../src/storage/index.js';
import { createMediaVerifier } from '../src/artifacts/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { runMediaChild } from '../src/storage/media/child.js';

test('actual encoded image/video dimension, fps and duration boundaries are measured rather than asserted metadata',{timeout:60000},async t=>{
  const docker=await realpath('/usr/local/bin/docker'),sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});
  const cases=[{kind:'image',width:4096,height:4096,rate:1,duration:1,pass:true},{kind:'image',width:4097,height:240,rate:1,duration:1,pass:false},{kind:'video',width:1920,height:1080,rate:60,duration:1,pass:true},{kind:'video',width:1922,height:180,rate:24,duration:1,pass:false},{kind:'video',width:320,height:180,rate:61,duration:1,pass:false},{kind:'video',width:320,height:180,rate:1,duration:120,pass:true},{kind:'video',width:320,height:180,rate:1,duration:121,pass:false}] as const;
  try{
    const files=await sandbox.use(await readFile('apps/web/test/fixtures/library-tile.png'),async job=>{
      const result:{bytes:Buffer;spec:typeof cases[number]}[]=[];
      for(const spec of cases){const file=spec.kind==='image'?'/work/boundary.png':'/work/boundary.mp4';
        const args=['/tools/ffmpeg','-nostdin','-v','error','-f','lavfi','-i',`color=c=navy:size=${spec.width}x${spec.height}:rate=${spec.rate}:duration=${spec.duration}${spec.kind==='image'?',format=rgb24':''}`,'-filter_threads','1','-threads','1',...(spec.kind==='image'?['-frames:v','1','-c:v','png','-pix_fmt','rgb24']:['-c:v','libopenh264','-pix_fmt','yuv420p','-b:v','100k','-movflags','+faststart']),'-y',file];
        await runMediaChild(docker,['exec',job.resource.id,...args],{timeoutMs:5000});const bytes=(await runMediaChild(docker,['exec',job.resource.id,'/bin/cat',file],{timeoutMs:2000})).stdout;result.push({bytes,spec});
      }return result;
    });
    const verify=createMediaVerifier(sandbox);
    for(const {bytes,spec} of files){const input={kind:spec.kind,bytes,contentType:spec.kind==='image'?'image/png':'video/mp4',signal:new AbortController().signal};if(spec.pass){const media=await verify(input);assert.equal(media.width,spec.width);assert.equal(media.height,spec.height);if(spec.kind==='video')assert.equal(media.durationMs,spec.duration*1000);}else await assert.rejects(verify(input),{code:'unsupported'});t.diagnostic(`Actual encoded ${spec.kind} ${spec.width}x${spec.height} ${spec.rate}fps ${spec.duration}s: ${spec.pass?'accepted':'rejected'}`);}
  }finally{await sandbox.close();}
});
