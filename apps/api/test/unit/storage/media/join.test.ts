import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MediaProcessError } from '../../../../src/storage/index.js';
import { checkJoinInputs, checkJoinPlan, JOIN_LIST, JOIN_OUTPUT, joinArgs, joinClipPath, joinList, MEDIA_JOIN_OUTPUT_BYTES, type MediaJoinPlan } from '../../../../src/storage/media/join.js';
import { MEDIA_JOB_BYTES, MEDIA_POSTER_BYTES, mediaContainerArgs } from '../../../../src/storage/media/sandbox-config.js';

const invalid = (error: unknown) => error instanceof MediaProcessError && error.code === 'invalid_input';
const plan = (clips: readonly boolean[], audio: MediaJoinPlan['audio'] = { rate: 32000, channels: 2 }): MediaJoinPlan => ({ clips: clips.map(hasAudio => ({ lengthS: 4.041667, audio: hasAudio })), audio });
// `runMediaChild`'s argv bounds (child.ts).
const fitsChild = (args: readonly string[]) => args.length <= 128 && args.every(arg => arg.length <= 4096);

test('the join command holds only fixed paths, fixed options and the plan\'s numbers', () => {
  const args = joinArgs(plan([true, false, true]));
  assert.deepEqual(args.slice(0, 22), ['-nostdin', '-v', 'error', '-xerror', '-threads', '1', '-filter_threads', '1', '-protocol_whitelist', 'file', '-format_whitelist', 'concat,mov', '-copyts', '-auto_convert', '0', '-safe', '0', '-f', 'concat', '-i', JOIN_LIST, '-f']);
  // Only the clips with audio are read again for their sound, each as MP4.
  assert.deepEqual(args.slice(21, 29), ['-f', 'mov', '-i', joinClipPath(0), '-f', 'mov', '-i', joinClipPath(2)]);
  const graph = args[args.indexOf('-filter_complex') + 1];
  assert.equal(graph, [
    '[1:a:0]aresample=32000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=end=4.041667[a0]',
    'anullsrc=r=32000:cl=stereo,atrim=end=4.041667[a1]',
    '[2:a:0]aresample=32000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=end=4.041667[a2]',
    '[a0][a1][a2]concat=n=3:v=0:a=1[a]',
  ].join(';'));
  assert.deepEqual(args.slice(args.indexOf('-filter_complex') + 2), ['-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', '-y', JOIN_OUTPUT]);
  // With no audio anywhere, the picture is copied alone.
  assert.deepEqual(joinArgs(plan([false, false], null)).slice(21), ['-map', '0:v:0', '-an', '-c:v', 'copy', '-movflags', '+faststart', '-y', JOIN_OUTPUT]);
  assert.equal(joinArgs(plan([true, true], { rate: 48000, channels: 1 })).find(arg => arg.includes('aformat')), '[1:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,apad,atrim=end=4.041667[a0];[2:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,apad,atrim=end=4.041667[a1];[a0][a1]concat=n=2:v=0:a=1[a]');
  assert.equal(joinList(plan([true, false])), `ffconcat version 1.0\nfile '${joinClipPath(0)}'\nduration 4.041667\nfile '${joinClipPath(1)}'\nduration 4.041667\n`);
});

test('20 clips stay within the child process\'s argument bounds', () => {
  const twenty = plan(Array.from({ length: 20 }, () => true));
  assert.ok(fitsChild(['exec', 'f'.repeat(64), '/tools/ffmpeg', ...joinArgs(twenty)]));
  const mounts = [...Array.from({ length: 20 }, (_, index) => ({ src: `/tmp/workprint-media-x/clip-${index}`, dst: joinClipPath(index), readonly: true })),
    { src: '/tmp/workprint-media-x/list', dst: JOIN_LIST, readonly: true }, { src: '/tmp/workprint-media-x/output', dst: JOIN_OUTPUT, readonly: false }];
  assert.ok(fitsChild(mediaContainerArgs({ owner: 'o', name: 'workprint-media-o' }, { tools: '/tools-bin', mounts, fsize: MEDIA_JOIN_OUTPUT_BYTES }, Date.now())));
});

test('the container\'s file size limit and mounts are the job\'s own', () => {
  const args = (fsize: number) => mediaContainerArgs({ owner: 'o', name: 'n' }, { tools: '/t', mounts: [{ src: '/a', dst: '/input.bin', readonly: true }, { src: '/b', dst: '/poster.png', readonly: false }], fsize }, 1);
  assert.ok(args(MEDIA_POSTER_BYTES).includes(`fsize=${MEDIA_POSTER_BYTES}:${MEDIA_POSTER_BYTES}`));
  assert.ok(args(MEDIA_JOIN_OUTPUT_BYTES).includes(`fsize=${MEDIA_JOIN_OUTPUT_BYTES}:${MEDIA_JOIN_OUTPUT_BYTES}`));
  assert.ok(args(1).includes('type=bind,src=/a,dst=/input.bin,readonly') && args(1).includes('type=bind,src=/b,dst=/poster.png'));
});

test('a join is refused before Docker for the wrong number of clips, too many bytes or an unusable plan', () => {
  const clip = new Uint8Array([1]);
  assert.throws(() => checkJoinInputs([clip]), invalid);
  assert.throws(() => checkJoinInputs(Array.from({ length: 21 }, () => clip)), invalid);
  assert.throws(() => checkJoinInputs([clip, new Uint8Array()]), invalid);
  assert.throws(() => checkJoinInputs([new Uint8Array(MEDIA_JOB_BYTES / 2 + 1), new Uint8Array(MEDIA_JOB_BYTES / 2)]), invalid);
  checkJoinInputs(Array.from({ length: 20 }, () => clip));
  checkJoinPlan(plan([true, false]), 2);
  checkJoinPlan(plan([false, false], null), 2);
  assert.throws(() => checkJoinPlan(plan([true, false]), 3), invalid);
  assert.throws(() => checkJoinPlan(plan([true, true], { rate: 44000, channels: 2 }), 2), invalid);
  assert.throws(() => checkJoinPlan(plan([true, true], { rate: 32000, channels: 3 }), 2), invalid);
  assert.throws(() => checkJoinPlan(plan([true, false], null), 2), invalid);
  assert.throws(() => checkJoinPlan({ clips: [{ lengthS: Number.NaN, audio: false }, { lengthS: 1, audio: false }], audio: null }, 2), invalid);
});
