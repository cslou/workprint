import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureMediaProbe, parseMediaProbe, verifyDecodedFrames } from '../../../../src/artifacts/uploads/media-probe.js';

test('closed metadata parser rejects extra streams, unsupported variants and decoder count disagreement',()=>{
  const native={streams:[{codec_type:'video',codec_name:'h264',codec_tag_string:'avc1',profile:'Constrained Baseline',pix_fmt:'yuv420p',width:320,height:180,sample_aspect_ratio:'1:1',field_order:'progressive',r_frame_rate:'24/1',avg_frame_rate:'24/1',duration:'1.000000',nb_frames:'24',disposition:{attached_pic:0}}],format:{format_name:'mov,mp4,m4a,3gp,3g2,mj2',size:'100',duration:'1.000000',filename:'/private/input'}};
  const parse=(x:unknown)=>parseMediaProbe(Buffer.from(JSON.stringify(x)));
  assert.equal('filename' in parse(native).format,false);
  assert.equal(measureMediaProbe(parse(native),'video','video/mp4',100).frames,24);
  for(const patch of [{pix_fmt:'yuv420p10le'},{profile:'High 10'},{avg_frame_rate:'61/1'},{avg_frame_rate:'0/0'},{width:1921},{height:1081},{duration:'120.1'},{nb_frames:'900000'},{codec_name:'hevc'},{side_data_list:[{rotation:90}]}])assert.throws(()=>measureMediaProbe(parse({...native,streams:[{...native.streams[0],...patch}]}),'video','video/mp4',100));
  assert.throws(()=>measureMediaProbe(parse({...native,streams:[...native.streams,...native.streams]}),'video','video/mp4',100));
  // MiniMax's clips: High profile, no aspect-ratio tag, portrait or landscape 768P. Only the assistant's are allowed.
  const minimax={...native.streams[0],profile:'High',sample_aspect_ratio:undefined,width:1344,height:768};
  const probe=(patch:object)=>parse({...native,streams:[{...minimax,...patch}]});
  for(const patch of [{},{width:768,height:1344},{profile:'Main'},{sample_aspect_ratio:'1:1'},{width:1080,height:1920}])assert.equal(measureMediaProbe(probe(patch),'video','video/mp4',100,'assistant').frames,24,JSON.stringify(patch));
  for(const patch of [{width:1921,height:768},{width:768,height:1921},{width:1200,height:1200},{avg_frame_rate:'25/1'},{profile:'High 10'},{sample_aspect_ratio:'4:3'},{duration:'120.1'}])assert.throws(()=>measureMediaProbe(probe(patch),'video','video/mp4',100,'assistant'),{code:'unsupported'},JSON.stringify(patch));
  for(const patch of [{},{profile:'Constrained Baseline'},{sample_aspect_ratio:'1:1',profile:'High'},{profile:'Constrained Baseline',sample_aspect_ratio:'1:1',width:768,height:1344}])assert.throws(()=>measureMediaProbe(probe(patch),'video','video/mp4',100),{code:'unsupported'},`upload ${JSON.stringify(patch)}`);
  assert.throws(()=>parse({streams:[],format:{}}));assert.throws(()=>parseMediaProbe(Buffer.from('{bad')));
  verifyDecodedFrames(Buffer.from('frame=24\nout_time_us=1000000\nprogress=end\n'),24,1000);
  for(const output of ['frame=23\nout_time_us=1000000\nprogress=end','frame=24\nout_time_us=2000000\nprogress=end','frame=24\nprogress=continue'])assert.throws(()=>verifyDecodedFrames(Buffer.from(output),24,1000),{code:'invalid_input'});
});
