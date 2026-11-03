import { MAX_UPLOAD_VIDEO_BYTES } from '@workprint/contracts';
import { MediaProcessError } from './errors.js';
import { MEDIA_JOB_BYTES } from './sandbox-config.js';

/** How many clips one join takes. */
export const MEDIA_JOIN_CLIPS = Object.freeze({ min: 2, max: 20 });
/** The joined file is a video like any other, so it may be as large as an uploaded one. */
export const MEDIA_JOIN_OUTPUT_BYTES = MAX_UPLOAD_VIDEO_BYTES;
/** The AAC-LC sample rates the video check accepts; the joined audio uses one of them. */
export const JOIN_AUDIO_RATES: readonly number[] = Object.freeze([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
export const JOIN_LIST = '/clips.ffconcat';
export const JOIN_OUTPUT = '/output.mp4';
export const joinClipPath = (index: number) => `/clip-${index}.mp4`;

/**
 * What the join is told, all from the clips' probes: each clip's picture length and whether it has audio, and the
 * joined audio's rate and channels (null when no clip has audio).
 */
export type MediaJoinPlan = Readonly<{ clips: readonly Readonly<{ lengthS: number; audio: boolean }>[]; audio: Readonly<{ rate: number; channels: number }> | null }>;

/** The join's probe: one clip's streams with their codec configuration hash (`extradata_hash`), as MP4 only. */
export const JOIN_PROBE_ARGS = Object.freeze(['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', 'mov', '-show_data_hash', 'sha256', '-show_streams', '-show_format', '-of', 'json']);

/** 2 to 20 non-empty clips, together within one job's bytes. */
export function checkJoinInputs(clips: readonly Uint8Array[]): void {
  const total = clips.reduce((sum, clip) => sum + clip.byteLength, 0);
  if (clips.length < MEDIA_JOIN_CLIPS.min || clips.length > MEDIA_JOIN_CLIPS.max || clips.some(clip => !(clip instanceof Uint8Array) || !clip.byteLength) || total > MEDIA_JOB_BYTES) throw new MediaProcessError('invalid_input');
}

/** A plan for `count` clips: positive finite lengths, and an allowed rate with 1 or 2 channels whenever a clip has audio. */
export function checkJoinPlan(plan: MediaJoinPlan, count: number): void {
  const lengths = plan.clips.every(clip => Number.isFinite(clip.lengthS) && clip.lengthS > 0 && clip.lengthS <= 3600 && typeof clip.audio === 'boolean');
  const audio = plan.audio === null ? !plan.clips.some(clip => clip.audio) : JOIN_AUDIO_RATES.includes(plan.audio.rate) && (plan.audio.channels === 1 || plan.audio.channels === 2);
  if (plan.clips.length !== count || !lengths || !audio) throw new MediaProcessError('invalid_input');
}

const seconds = (value: number) => value.toFixed(6);

/** The `ffconcat` list: each mounted clip in order, with its picture length. */
export function joinList(plan: MediaJoinPlan): string {
  return ['ffconcat version 1.0', ...plan.clips.flatMap((clip, index) => [`file '${joinClipPath(index)}'`, `duration ${seconds(clip.lengthS)}`])].join('\n') + '\n';
}

/**
 * The one join command. The picture is copied: the concat demuxer over the list, with each clip's own timestamps
 * (`-copyts`) and its packets unchanged (`-auto_convert 0`). The sound is made once: each clip's audio, read on its
 * own so its priming is dropped, or silence for a clip with none, is padded and trimmed to the clip's picture length,
 * joined, and encoded as AAC-LC at the plan's rate and channels. With no audio in any clip, the video has none.
 */
export function joinArgs(plan: MediaJoinPlan): string[] {
  const head = ['-nostdin', '-v', 'error', '-xerror', '-threads', '1', '-filter_threads', '1',
    '-protocol_whitelist', 'file', '-format_whitelist', 'concat,mov', '-copyts', '-auto_convert', '0', '-safe', '0', '-f', 'concat', '-i', JOIN_LIST];
  const tail = ['-movflags', '+faststart', '-y', JOIN_OUTPUT];
  if (!plan.audio) return [...head, '-map', '0:v:0', '-an', '-c:v', 'copy', ...tail];
  const { rate } = plan.audio, layout = plan.audio.channels === 1 ? 'mono' : 'stereo';
  // Each clip with audio is its own input, forced to the MP4 demuxer.
  const inputs = plan.clips.flatMap((clip, index) => clip.audio ? ['-f', 'mov', '-i', joinClipPath(index)] : []);
  let input = 0;
  const parts = plan.clips.map((clip, index) => {
    const source = clip.audio ? `[${++input}:a:0]aresample=${rate},aformat=sample_fmts=fltp:channel_layouts=${layout},apad` : `anullsrc=r=${rate}:cl=${layout}`;
    return `${source},atrim=end=${seconds(clip.lengthS)}[a${index}]`;
  });
  const graph = `${parts.join(';')};${plan.clips.map((_, index) => `[a${index}]`).join('')}concat=n=${plan.clips.length}:v=0:a=1[a]`;
  return [...head, ...inputs, '-filter_complex', graph, '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', ...tail];
}
