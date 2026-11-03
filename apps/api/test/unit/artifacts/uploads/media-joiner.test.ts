import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMediaJoiner, joinCheck, parseJoinProbe, type JoinProbe } from '../../../../src/artifacts/uploads/media-joiner.js';
import { UploadError } from '../../../../src/artifacts/index.js';
import { MediaProcessError, type MediaJoinSession, type MediaSandbox } from '../../../../src/storage/index.js';

// The join probe of a MiniMax-H3 768P clip (minimax-clip.mp4), with its codec configuration hash.
const video = { index: 0, codec_type: 'video', codec_name: 'h264', profile: 'High', level: 32, width: 1344, height: 768, pix_fmt: 'yuv420p', r_frame_rate: '24/1', time_base: '1/12288', extradata_hash: 'SHA256:eae0cee', duration: '4.041667', nb_frames: '97' };
const audio = { index: 1, codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '32000', channels: 2, duration: '4.032000' };
const clip = (changes: Partial<typeof video> = {}, sound: Partial<typeof audio> | null = {}): JoinProbe => ({ streams: [{ ...video, ...changes }, ...(sound ? [{ ...audio, ...sound }] : [])] });

test('MiniMax-shaped clips join, with clip 1\'s sound and every clip\'s frames and length', () => {
  const check = joinCheck([clip(), clip({}, null), clip({ duration: '6.583333', nb_frames: '158' })]);
  assert.equal(check.kind, 'compatible');
  if (check.kind !== 'compatible') return;
  assert.deepEqual(check.plan, { clips: [{ lengthS: 4.041667, audio: true }, { lengthS: 4.041667, audio: false }, { lengthS: 6.583333, audio: true }], audio: { rate: 32000, channels: 2 } });
  assert.equal(check.frames, 352);
  assert.ok(Math.abs(check.lengthS - 14.666667) < 1e-6);
  // Clip 1 without sound gives 32 kHz stereo; no sound anywhere gives none.
  assert.deepEqual(joinCheck([clip({}, null), clip()]).kind === 'compatible' && joinCheck([clip({}, null), clip()]), { kind: 'compatible', plan: { clips: [{ lengthS: 4.041667, audio: false }, { lengthS: 4.041667, audio: true }], audio: { rate: 32000, channels: 2 } }, frames: 194, lengthS: 8.083334 });
  const silent = joinCheck([clip({}, null), clip({}, null)]);
  assert.equal(silent.kind === 'compatible' && silent.plan.audio, null);
  const mono = joinCheck([clip({}, { sample_rate: '48000', channels: 1 }), clip()]);
  assert.deepEqual(mono.kind === 'compatible' && mono.plan.audio, { rate: 48000, channels: 1 });
  // Clip 1's sound is passed on as probed; the join itself refuses a rate or channel count it can't use.
  const odd = joinCheck([clip({}, { sample_rate: '96000', channels: 6 }), clip()]);
  assert.deepEqual(odd.kind === 'compatible' && odd.plan.audio, { rate: 96000, channels: 6 });
});

test('the first clip that differs is named, with what a person can see first', () => {
  assert.deepEqual(joinCheck([clip(), clip(), clip({ width: 672, height: 384 })]), { kind: 'incompatible', clip: 3, difference: '672×384; clip 1 is 1344×768' });
  assert.deepEqual(joinCheck([clip(), clip({ r_frame_rate: '30000/1001' })]), { kind: 'incompatible', clip: 2, difference: '29.97 fps; clip 1 is 24 fps' });
  assert.deepEqual(joinCheck([clip(), clip({ r_frame_rate: '0/0' })]), { kind: 'incompatible', clip: 2, difference: 'an unknown frame rate; clip 1 is 24 fps' });
  assert.deepEqual(joinCheck([clip(), clip({ extradata_hash: 'SHA256:c1619f7' })]), { kind: 'incompatible', clip: 2, difference: 'its encoding differs from clip 1\'s' });
  assert.deepEqual(joinCheck([clip(), clip({ level: 31 })]), { kind: 'incompatible', clip: 2, difference: 'its encoding differs from clip 1\'s' });
  assert.deepEqual(joinCheck([clip(), clip({ profile: 'Constrained Baseline' })]), { kind: 'incompatible', clip: 2, difference: 'its encoding differs from clip 1\'s' });
  assert.deepEqual(joinCheck([clip(), clip({ codec_name: 'hevc' })]), { kind: 'incompatible', clip: 2, difference: 'isn\'t H.264 video' });
  assert.deepEqual(joinCheck([clip(), { streams: [audio] }]), { kind: 'incompatible', clip: 2, difference: 'has no picture' });
  assert.deepEqual(joinCheck([clip(), { streams: [video, audio, { ...audio, index: 2 }] }]), { kind: 'incompatible', clip: 2, difference: 'has more than one sound track' });
  assert.deepEqual(joinCheck([clip(), { streams: [video, { index: 1, codec_type: 'data' }] }]), { kind: 'incompatible', clip: 2, difference: 'has a stream that is neither picture nor sound' });
  assert.deepEqual(joinCheck([clip(), { streams: [{ ...audio, index: 0 }, { ...video, index: 1 }] }]), { kind: 'incompatible', clip: 2, difference: 'has its picture and sound in an unusual order' });
  assert.deepEqual(joinCheck([clip({ nb_frames: 'N/A' }), clip()]), { kind: 'incompatible', clip: 1, difference: 'has no measurable length' });
});

test('a probe that isn\'t the expected JSON is refused', () => {
  assert.throws(() => parseJoinProbe(Buffer.from('not json')), error => error instanceof UploadError && error.code === 'invalid_input');
  assert.equal(parseJoinProbe(Buffer.from(JSON.stringify(clip()))).streams.length, 2);
});

test('the joiner returns no bytes when the output doesn\'t decode to every clip\'s frames, or the job fails', async () => {
  const probe = Buffer.from(JSON.stringify(clip()));
  const decode = (frames: number) => Buffer.from(`frame=${frames}\nout_time_us=8083333\nprogress=end\n`);
  /** A sandbox whose join job probes every clip as `minimax-clip.mp4` and answers the join with `join`. */
  const sandbox = (join: MediaJoinSession['join']) => ({
    join: (_clips: readonly Uint8Array[], work: (session: MediaJoinSession) => Promise<unknown>) => work({ resource: { owner: 'o', name: 'n', id: 'i' }, probe: async () => probe, join }),
  }) as unknown as MediaSandbox;
  const clips = [new Uint8Array([1]), new Uint8Array([2])], invalid = (error: unknown) => error instanceof UploadError && error.code === 'invalid_input';
  const joined = await createMediaJoiner(sandbox(async () => ({ bytes: Buffer.from('mp4'), decode: decode(194) })))(clips);
  assert.deepEqual(joined.kind === 'joined' && [joined.frames, joined.bytes.toString()], [194, 'mp4']);
  await assert.rejects(createMediaJoiner(sandbox(async () => ({ bytes: Buffer.from('mp4'), decode: decode(193) })))(clips), invalid);
  await assert.rejects(createMediaJoiner(sandbox(async () => { throw new MediaProcessError('failed'); }))(clips), invalid);
  await assert.rejects(createMediaJoiner(sandbox(async () => { throw new MediaProcessError('deadline'); }))(clips), (error: unknown) => error instanceof MediaProcessError && error.code === 'deadline');
});
