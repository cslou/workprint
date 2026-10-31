import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createMediaSandbox } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { createMediaVerifier } from '../src/artifacts/uploads/media-verifier.js';
import { qualifiedAudioVariants, qualifiedMediaFixtures } from './media-fixtures.js';

test('actual AAC-LC mono/stereo combinations up to48kHz and no audio are positively qualified', {timeout:60000},async t=>{
  const docker=await realpath('/usr/local/bin/docker');const sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});
  try{
    const base=await qualifiedMediaFixtures(sandbox,docker),variants=await qualifiedAudioVariants(sandbox,docker,base.video),verify=createMediaVerifier(sandbox);
    assert.equal(variants.length,19);
    for(const variant of variants){
      const shape=JSON.parse(variant.probe.toString()) as {streams:{codec_name:string;profile?:string;sample_rate?:string;channels?:number}[];format:{format_name:string}};
      const audio=shape.streams.find(s=>s.codec_name==='aac');assert.equal(shape.format.format_name,'mov,mp4,m4a,3gp,3g2,mj2');
      if(variant.rate){assert.equal(audio?.profile,'LC');assert.equal(audio.sample_rate,String(variant.rate));assert.equal(audio.channels,variant.channels);}else assert.equal(audio,undefined);
      t.diagnostic(`Observed actual native shape: H264, AAC-LC ${variant.rate}Hz/${variant.channels}channels`);
    }
    for(const variant of variants){
      const media=await verify({kind:'video',bytes:variant.bytes,contentType:'video/mp4',signal:new AbortController().signal});assert.equal(media.hasAudio,!!variant.rate);assert.equal(media.width,320);assert.equal(media.height,180);assert.ok(media.poster);
    }
  }finally{await sandbox.close();}
});
