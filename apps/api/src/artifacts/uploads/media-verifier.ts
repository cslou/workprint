import { MediaProcessError, type MediaSandbox } from '../../storage/index.js';
import { UploadError } from './errors.js';
import { inspectMediaBytes } from './media-bytes.js';
import { measureMediaProbe, parseMediaProbe, verifyDecodedFrames } from './media-probe.js';
import type { MediaVerifier } from './types.js';

/** Trusted composition capability; actual immutable byte/decode proof, never caller authority. */
export function createMediaVerifier(sandbox:MediaSandbox):MediaVerifier {
  return async input=>{
    const byteSize=input.bytes.byteLength,header=inspectMediaBytes(input.bytes,input.kind,input.contentType);
    try{return await sandbox.use(input.bytes,async job=>{
      const measured=measureMediaProbe(parseMediaProbe(await job.probe()),input.kind,input.contentType,byteSize);
      if(header.width!==undefined && (header.width!==measured.width || header.height!==measured.height))throw new UploadError('invalid_input');
      verifyDecodedFrames(await job.decode(),measured.frames,measured.durationMs);
      const media={width:measured.width,height:measured.height,...(input.kind==='video'?{durationMs:measured.durationMs!,hasAudio:!!measured.hasAudio}:{})};
      if(input.kind==='image')return{kind:input.kind,contentType:input.contentType,byteSize,...media};
      const poster=await job.poster();verifyDecodedFrames(poster.decode,1);const shape=inspectMediaBytes(poster.bytes,'image','image/png');const facts=measureMediaProbe(parseMediaProbe(poster.probe),'image','image/png',poster.bytes.length);
      if(shape.width!==measured.width || shape.height!==measured.height || facts.width!==measured.width || facts.height!==measured.height)throw new UploadError('invalid_input');
      return{kind:input.kind,contentType:input.contentType,byteSize,...media,poster:{bytes:Buffer.from(poster.bytes),contentType:'image/png' as const}};
    },input.signal);}catch(error){if(error instanceof MediaProcessError && error.code==='failed')throw new UploadError('invalid_input');throw error;}
  };
}
