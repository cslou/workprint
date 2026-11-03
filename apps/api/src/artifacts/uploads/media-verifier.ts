import { versionSchema } from '@workprint/contracts';
import { MediaProcessError, type MediaSandbox } from '../../storage/index.js';
import { UploadError } from './errors.js';
import { inspectMediaBytes } from './media-bytes.js';
import { measureMediaProbe, parseMediaProbe, verifyDecodedFrames } from './media-probe.js';
import type { MediaVerifier, MediaVersion, VerifiedMedia } from './types.js';

/** The verified facts as a version's media, only when they describe the expected bytes. */
export function measuredMedia(expected: Readonly<{ kind: 'image' | 'video'; contentType: string; byteSize: number }>, verified: VerifiedMedia): MediaVersion['media'] {
  const { kind, poster, ...media } = verified;
  if (kind !== expected.kind || media.contentType !== expected.contentType || media.byteSize !== expected.byteSize || (poster && (!['image/png', 'image/jpeg'].includes(poster.contentType) || !poster.bytes.byteLength || poster.bytes.byteLength > 10 * 1024 * 1024))) throw new UploadError('invalid_input');
  const parsed = versionSchema.safeParse({ id: 'verification', artifactId: 'verification', revision: 1, kind, media, createdBy: 'human', createdAt: new Date().toISOString(), dependencies: [] });
  if (!parsed.success || !('media' in parsed.data)) throw new UploadError('invalid_input'); return parsed.data.media;
}

const busy = (error: unknown) => error instanceof MediaProcessError && error.code === 'capacity';

export type WhenFreeOptions = Readonly<{ waitMs: number; retryMs: number; signal?: AbortSignal | undefined }>;
/** How long a sandbox job waits for its turn, and how often it tries again. */
export const sandboxTurn = Object.freeze({ waitMs: 30_000, retryMs: 250 });

/** The media sandbox runs one job at a time: another job's turn is waited out, within `waitMs`. The job keeps its own deadline. */
export async function whenFree<T>(job: () => Promise<T>, options: WhenFreeOptions): Promise<T> {
  const deadline = Date.now() + options.waitMs;
  for (;;) {
    try {
      return await job();
    } catch (error) {
      if (!busy(error) || Date.now() + options.retryMs > deadline || options.signal?.aborted) throw error;
      await new Promise(resolve => setTimeout(resolve, options.retryMs));
    }
  }
}

/** A media check that waits its turn, as `whenFree` does. Each try has its own 20 s limit. */
export const verifyWhenFree = (verifyMedia: MediaVerifier, input: Omit<Parameters<MediaVerifier>[0], 'signal'>, options: WhenFreeOptions): Promise<VerifiedMedia> =>
  whenFree(() => {
    const attempt = AbortSignal.timeout(20_000);
    return verifyMedia({ ...input, signal: options.signal ? AbortSignal.any([options.signal, attempt]) : attempt });
  }, options);

/** Trusted composition capability; actual immutable byte/decode proof, never caller authority. */
export function createMediaVerifier(sandbox:MediaSandbox):MediaVerifier {
  return async input=>{
    const byteSize=input.bytes.byteLength,header=inspectMediaBytes(input.bytes,input.kind,input.contentType,input.origin);
    try{return await sandbox.use(input.bytes,async job=>{
      const measured=measureMediaProbe(parseMediaProbe(await job.probe()),input.kind,input.contentType,byteSize,input.origin);
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
