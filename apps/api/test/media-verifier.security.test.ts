import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createMediaVerifier } from '../src/artifacts/uploads/media-verifier.js';
import { inspectMediaBytes } from '../src/artifacts/uploads/media-bytes.js';
import { measureMediaProbe, parseMediaProbe, verifyDecodedFrames } from '../src/artifacts/uploads/media-probe.js';
import { createMediaSandbox } from '../src/storage/media/sandbox.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';

test('actual pinned tools verify exact PNG/JPEG and full H264+AAC with a measured decoded poster', { timeout: 30000 }, async () => {
  const docker=await realpath('/usr/local/bin/docker');const sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});
  try {
    const fixtures=await qualifiedMediaFixtures(sandbox,docker),verify=createMediaVerifier(sandbox),signal=new AbortController().signal;
    for(const [bytes,contentType] of [[fixtures.png,'image/png'],[fixtures.jpeg,'image/jpeg']] as const){
      const before=Buffer.from(bytes);const media=await verify({kind:'image',bytes,contentType,signal});assert.equal(media.width,240);assert.equal(media.height,240);assert.equal(media.byteSize,bytes.length);assert.equal(media.poster,undefined);assert.deepEqual(bytes,before);
    }
    const video=await verify({kind:'video',bytes:fixtures.video,contentType:'video/mp4',signal});assert.equal(video.width,320);assert.equal(video.height,180);assert.equal(video.durationMs,1000);assert.equal(video.hasAudio,true);assert.ok(video.poster);assert.deepEqual(inspectMediaBytes(video.poster.bytes,'image','image/png'),{width:320,height:180});
    for(const [kind,bytes,contentType] of [['image',fixtures.jpeg,'image/png'],['image',fixtures.png.subarray(0,fixtures.png.length-1),'image/png'],['image',fixtures.jpeg.subarray(0,fixtures.jpeg.length-2),'image/jpeg'],['video',fixtures.video.subarray(0,fixtures.video.length-1),'video/mp4']] as const)await assert.rejects(verify({kind,bytes,contentType,signal}),{code:'invalid_input'});
    const badCrc=Buffer.from(fixtures.png);badCrc[50]=badCrc[50]!^1;await assert.rejects(verify({kind:'image',bytes:badCrc,contentType:'image/png',signal}),{code:'invalid_input'});
    const oversized=Buffer.from(fixtures.png);oversized.writeUInt32BE(4097,16);oversized.writeUInt32BE(crc32(oversized.subarray(12,29)),29);await assert.rejects(verify({kind:'image',bytes:oversized,contentType:'image/png',signal}),{code:'unsupported'});
    // Structurally complete MP4 with damaged actual H264 bytes: metadata alone must not qualify it.
    const damaged=Buffer.from(fixtures.video);const mdat=damaged.indexOf(Buffer.from('mdat'));assert.ok(mdat>0);damaged.fill(255,mdat+4,Math.min(damaged.length,mdat+1000));await assert.rejects(verify({kind:'video',bytes:damaged,contentType:'video/mp4',signal}));
    const captured=Buffer.from(fixtures.png);const pending=verify({kind:'image',bytes:captured,contentType:'image/png',signal});captured.fill(0);assert.equal((await pending).width,240,'The child uses the synchronous immutable snapshot, not later caller bytes');
  } finally {await sandbox.close();}
});

test('closed metadata parser rejects extra streams, unsupported variants and decoder count disagreement',()=>{
  const native={streams:[{codec_type:'video',codec_name:'h264',codec_tag_string:'avc1',profile:'Constrained Baseline',pix_fmt:'yuv420p',width:320,height:180,sample_aspect_ratio:'1:1',field_order:'progressive',r_frame_rate:'24/1',avg_frame_rate:'24/1',duration:'1.000000',nb_frames:'24',disposition:{attached_pic:0}}],format:{format_name:'mov,mp4,m4a,3gp,3g2,mj2',size:'100',duration:'1.000000',filename:'/private/input'}};
  const parse=(x:unknown)=>parseMediaProbe(Buffer.from(JSON.stringify(x)));
  assert.equal('filename' in parse(native).format,false);
  assert.equal(measureMediaProbe(parse(native),'video','video/mp4',100).frames,24);
  for(const patch of [{pix_fmt:'yuv420p10le'},{profile:'High 10'},{avg_frame_rate:'61/1'},{avg_frame_rate:'0/0'},{width:1921},{height:1081},{duration:'120.1'},{nb_frames:'900000'},{codec_name:'hevc'},{side_data_list:[{rotation:90}]}])assert.throws(()=>measureMediaProbe(parse({...native,streams:[{...native.streams[0],...patch}]}),'video','video/mp4',100));
  assert.throws(()=>measureMediaProbe(parse({...native,streams:[...native.streams,...native.streams]}),'video','video/mp4',100));
  assert.throws(()=>parse({streams:[],format:{}}));assert.throws(()=>parseMediaProbe(Buffer.from('{bad')));
  verifyDecodedFrames(Buffer.from('frame=24\nout_time_us=1000000\nprogress=end\n'),24,1000);
  for(const output of ['frame=23\nout_time_us=1000000\nprogress=end','frame=24\nout_time_us=2000000\nprogress=end','frame=24\nprogress=continue'])assert.throws(()=>verifyDecodedFrames(Buffer.from(output),24,1000),{code:'invalid_input'});
});
