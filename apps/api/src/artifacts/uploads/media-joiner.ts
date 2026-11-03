import { z } from 'zod';
import { MediaProcessError, type MediaJoinPlan, type MediaSandbox } from '../../storage/index.js';
import { UploadError } from './errors.js';
import { verifyDecodedFrames } from './media-probe.js';

const stream = z.object({
  index: z.number().int().nonnegative(), codec_type: z.string().max(32), codec_name: z.string().max(64).optional(), profile: z.string().max(64).optional(), level: z.number().int().optional(),
  width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), pix_fmt: z.string().max(32).optional(),
  r_frame_rate: z.string().max(32).optional(), time_base: z.string().max(32).optional(), extradata_hash: z.string().max(128).optional(),
  duration: z.string().max(32).optional(), nb_frames: z.string().max(32).optional(), sample_rate: z.string().max(16).optional(), channels: z.number().int().optional(),
});
const probeSchema = z.object({ streams: z.array(stream).max(8) });
/** One clip's streams, as the join's probe reports them. */
export type JoinProbe = z.infer<typeof probeSchema>;

export function parseJoinProbe(bytes: Buffer): JoinProbe {
  try { if (bytes.length > 65536) throw new Error('too long'); return probeSchema.parse(JSON.parse(bytes.toString('utf8'))); }
  catch { throw new UploadError('invalid_input'); }
}

/** Clips that can be joined, with the join's plan and the frames and length it must have; or the first clip that can't. */
export type JoinCheck =
  | { kind: 'compatible'; plan: MediaJoinPlan; frames: number; lengthS: number }
  | { kind: 'incompatible'; clip: number; difference: string };

const positive = (value: string | undefined) => { const number = value !== undefined && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN; return number > 0 ? number : undefined; };
/** A frame rate as people read it: `24 fps`, or `29.97 fps`. */
function fps(rate: string | undefined): string {
  const [top, bottom] = (rate ?? '').split('/').map(Number);
  return top && bottom ? `${Math.round(top / bottom * 100) / 100} fps` : 'an unknown frame rate';
}

/**
 * Whether the clips can be joined by copying their picture: each has one H.264 4:2:0 video stream first and at most
 * one audio stream after it (the concat demuxer pairs streams by position), and every clip's video matches clip 1's size, frame rate, profile, level, time base and codec
 * configuration. The difference names what a person can see first (size, then frame rate), else "its encoding".
 * The joined audio takes clip 1's rate and channels as probed (the join refuses ones it can't use), or 32 kHz stereo
 * when clip 1 has none.
 */
export function joinCheck(probes: readonly JoinProbe[]): JoinCheck {
  const clips = [];
  for (const [index, probe] of probes.entries()) {
    const refuse = (difference: string): JoinCheck => ({ kind: 'incompatible', clip: index + 1, difference });
    const videos = probe.streams.filter(item => item.codec_type === 'video'), audios = probe.streams.filter(item => item.codec_type === 'audio');
    if (videos.length + audios.length !== probe.streams.length) return refuse('has a stream that is neither picture nor sound');
    if (videos.length !== 1) return refuse(videos.length ? 'has more than one picture stream' : 'has no picture');
    if (audios.length > 1) return refuse('has more than one sound track');
    if (videos[0]!.index !== 0 || (audios[0] && audios[0].index !== 1)) return refuse('has its picture and sound in an unusual order');
    const video = videos[0]!, lengthS = positive(video.duration), frames = positive(video.nb_frames);
    if (video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p' || !video.width || !video.height || !video.extradata_hash) return refuse('isn\'t H.264 video');
    if (!lengthS || !frames || !Number.isInteger(frames)) return refuse('has no measurable length');
    clips.push({ video, audio: audios[0], lengthS, frames });
    const first = clips[0]!.video;
    if (video.width !== first.width || video.height !== first.height) return refuse(`${video.width}×${video.height}; clip 1 is ${first.width}×${first.height}`);
    if (video.r_frame_rate !== first.r_frame_rate) return refuse(`${fps(video.r_frame_rate)}; clip 1 is ${fps(first.r_frame_rate)}`);
    if (video.profile !== first.profile || video.level !== first.level || video.time_base !== first.time_base || video.extradata_hash !== first.extradata_hash) return refuse('its encoding differs from clip 1\'s');
  }
  const sound = clips[0]?.audio, anyAudio = clips.some(clip => clip.audio);
  const audio = !anyAudio ? null : sound ? { rate: Number(sound.sample_rate), channels: sound.channels ?? 0 } : { rate: 32000, channels: 2 };
  return {
    kind: 'compatible', plan: { clips: clips.map(clip => ({ lengthS: clip.lengthS, audio: !!clip.audio })), audio },
    frames: clips.reduce((sum, clip) => sum + clip.frames, 0), lengthS: clips.reduce((sum, clip) => sum + clip.lengthS, 0),
  };
}

/** The joined video and what it must measure, or the first clip that can't be joined. */
export type JoinedMedia = { kind: 'joined'; bytes: Buffer; frames: number; lengthS: number } | { kind: 'incompatible'; clip: number; difference: string };
/** Joins clips in order in one sandbox job. A clip the job can't read, or an output that decodes wrong, is `invalid_input`. */
export type MediaJoiner = (clips: readonly Uint8Array[], signal?: AbortSignal) => Promise<JoinedMedia>;

/**
 * Trusted composition capability, beside the media verifier: it probes each clip, refuses clips that can't be joined
 * by copying their picture, joins the rest and checks the output decodes to every clip's frames. The joined bytes still
 * need the ordinary video check before they are saved.
 */
export function createMediaJoiner(sandbox: MediaSandbox): MediaJoiner {
  return async (clips, signal) => {
    try {
      return await sandbox.join(clips, async session => {
        const probes: JoinProbe[] = [];
        for (const index of clips.keys()) probes.push(parseJoinProbe(await session.probe(index)));
        const check = joinCheck(probes);
        if (check.kind === 'incompatible') return check;
        const { bytes, decode } = await session.join(check.plan);
        // Every clip's frames, exactly; the length within the decode check's 50 ms. The saved video's length is checked
        // against the clips' again when it is saved.
        verifyDecodedFrames(decode, check.frames, Math.round(check.lengthS * 1000));
        return { kind: 'joined', bytes, frames: check.frames, lengthS: check.lengthS };
      }, signal);
    } catch (error) {
      if (error instanceof MediaProcessError && error.code === 'failed') throw new UploadError('invalid_input');
      throw error;
    }
  };
}
