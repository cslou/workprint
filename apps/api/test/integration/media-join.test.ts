import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createMediaJoiner, createMediaVerifier, joinWhenFree, type JoinedMedia } from '../../src/artifacts/index.js';
import { createMediaSandbox, MediaProcessError } from '../../src/storage/index.js';
import { runMediaChild } from '../../src/storage/media/child.js';
import { MEDIA_JOIN_OUTPUT_BYTES } from '../../src/storage/media/join.js';
import { MEDIA_POSTER_BYTES } from '../../src/storage/media/sandbox-config.js';
import { testStack } from '../support/test-stack.js';

const fixture = (name: string) => readFile(`apps/api/test/support/fixtures/${name}`);
const frame = 1 / 24;

test('the media sandbox joins clips by copying their picture and remaking their sound once', { timeout: 180000 }, async t => {
  const { media } = testStack();
  const sandbox = await createMediaSandbox(media.toolchain);
  t.after(() => sandbox.close());
  const join = createMediaJoiner(sandbox), verify = createMediaVerifier(sandbox);
  const [clip, silent, small] = await Promise.all([fixture('minimax-clip.mp4'), fixture('minimax-clip-silent.mp4'), fixture('minimax-clip-small.mp4')]);
  const docker = (args: string[]) => runMediaChild(media.toolchain.dockerPath, args, { timeoutMs: 5000 }).then(result => result.stdout.toString().trim());
  const joined = (result: JoinedMedia) => { assert.equal(result.kind, 'joined'); return result as Extract<JoinedMedia, { kind: 'joined' }>; };
  /** The joined video as the ordinary video check and a probe see it. */
  const measure = async (bytes: Buffer) => {
    const checked = await verify({ kind: 'video', bytes, contentType: 'video/mp4', origin: 'assistant', signal: AbortSignal.timeout(20000) });
    const probe = JSON.parse((await sandbox.use(bytes, session => session.probe())).toString()) as { streams: { codec_type: string; codec_name: string; duration: string; nb_frames: string; start_time: string }[] };
    return { checked, video: probe.streams.find(stream => stream.codec_type === 'video')!, audio: probe.streams.find(stream => stream.codec_type === 'audio') };
  };

  await t.test('three clips, one without sound, play as one video with sound throughout', async () => {
    const result = joined(await join([clip, clip, silent]));
    assert.equal(result.frames, 291);
    const { checked, video, audio } = await measure(result.bytes);
    assert.equal(video.nb_frames, '291');
    assert.ok(Math.abs(Number(video.duration) - 12.125) <= frame, video.duration);
    assert.equal(checked.width, 1344);
    assert.equal(checked.hasAudio, true);
    assert.equal(audio?.codec_name, 'aac');
    assert.ok(Math.abs(Number(audio.duration) - Number(video.duration)) <= frame, `${audio.duration} vs ${video.duration}`);
    // Sound and picture start together, so the sound stays in step with every clip.
    assert.ok(Math.abs(Number(video.start_time)) <= frame && Math.abs(Number(audio.start_time)) <= frame, `${video.start_time}, ${audio.start_time}`);
  });

  await t.test('distinct silent clips retain their requested picture order and remain silent', async () => {
    const [red, blue] = await sandbox.use(media.png, async session => {
      const exec = async (args: string[]) => (await runMediaChild(media.toolchain.dockerPath, ['exec', session.resource.id, ...args], { timeoutMs: 5000 })).stdout;
      const clips: Buffer[] = [];
      for (const color of ['red', 'blue']) {
        await exec(['/tools/ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-filter_threads', '1', '-f', 'lavfi', '-i', `color=${color}:size=320x180:rate=24:duration=1`, '-c:v', 'libopenh264', '-pix_fmt', 'yuv420p', '-b:v', '100k', '-an', '-movflags', '+faststart', '-y', '/work/color.mp4']);
        clips.push(await exec(['/bin/cat', '/work/color.mp4']));
      }
      return clips as [Buffer, Buffer];
    });
    // Reverse creation order deliberately: metadata alone cannot prove content order.
    const result = joined(await join([blue, red]));
    const { checked, audio } = await measure(result.bytes);
    assert.equal(checked.hasAudio, false);
    assert.equal(audio, undefined);
    assert.equal(result.frames, 48);
    await sandbox.use(result.bytes, async session => {
      const pixel = async (time: string) => (await runMediaChild(media.toolchain.dockerPath, ['exec', session.resource.id, '/tools/ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-filter_threads', '1', '-ss', time, '-i', '/input.bin', '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { timeoutMs: 5000 })).stdout;
      const first = await pixel('0.5'), second = await pixel('1.5');
      assert.equal(first.length, 3); assert.equal(second.length, 3);
      assert.ok(first[2]! > 200 && first[0]! < 30, `First segment must be blue: ${[...first]}`);
      assert.ok(second[0]! > 200 && second[2]! < 30, `Second segment must be red: ${[...second]}`);
    });
  });

  await t.test('a clip of another size is refused, naming it', async () => {
    assert.deepEqual(await join([clip, small]), { kind: 'incompatible', clip: 2, difference: '672×384; clip 1 is 1344×768' });
  });

  await t.test('twenty clips join within one job\'s deadline, waiting their turn as the server does', async () => {
    const result = joined(await joinWhenFree(join)(Array.from({ length: 20 }, () => clip)));
    assert.equal(result.frames, 1940);
    assert.ok(Math.abs(result.lengthS - 80.833333) <= frame);
  });

  await t.test('each job keeps its own file size limit', async () => {
    const limit = async (id: string) => JSON.parse(await docker(['inspect', id, '--format', '{{json .HostConfig.Ulimits}}'])).find((item: { Name: string }) => item.Name === 'fsize').Hard as number;
    assert.equal(await sandbox.use(clip, async session => {
      const actual = JSON.parse(await docker(['inspect', session.resource.id]))[0];
      assert.equal(actual.HostConfig.NetworkMode, 'none');
      assert.equal(actual.HostConfig.ReadonlyRootfs, true);
      assert.equal(actual.Config.User, '65534:65534');
      assert.deepEqual(actual.HostConfig.CapDrop, ['ALL']);
      assert.ok(actual.HostConfig.SecurityOpt.includes('no-new-privileges'));
      assert.equal(actual.HostConfig.Memory, 768 * 1024 * 1024);
      assert.equal(actual.HostConfig.PidsLimit, 64);
      assert.equal(actual.Mounts.find((mount: { Destination: string }) => mount.Destination === '/tools').RW, false);
      return limit(session.resource.id);
    }), MEDIA_POSTER_BYTES);
    assert.equal(await sandbox.join([clip, clip], session => limit(session.resource.id)), MEDIA_JOIN_OUTPUT_BYTES);
  });

  await t.test('another running job refuses a join with capacity, and that job still finishes', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const running = sandbox.use(clip, async session => { await held; return session.probe(); });
    await new Promise(resolve => setTimeout(resolve, 200));
    await assert.rejects(join([clip, clip]), error => error instanceof MediaProcessError && error.code === 'capacity');
    release();
    assert.ok((await running).length > 0);
  });

  const containers = () => docker(['ps', '-a', '--filter', 'name=^/workprint-media-', '--format', '{{.ID}}']);
  const code = (expected: string) => (error: unknown) => error instanceof MediaProcessError && error.code === expected;

  await t.test('too few or too many clips are refused before any container is made', async () => {
    await assert.rejects(sandbox.join([clip], () => assert.fail('no job runs')), code('invalid_input'));
    await assert.rejects(sandbox.join(Array.from({ length: 21 }, () => clip), () => assert.fail('no job runs')), code('invalid_input'));
    assert.equal(await containers(), '');
  });

  await t.test('Stop while the join command runs cancels it and leaves no container', async () => {
    const stop = new AbortController(), clips = Array.from({ length: 20 }, () => clip);
    let started = false;
    await assert.rejects(sandbox.join(clips, async session => {
      for (const index of clips.keys()) await session.probe(index);
      const joining = session.join({ clips: clips.map(() => ({ lengthS: 4.041667, audio: true })), audio: { rate: 32000, channels: 2 } });
      started = true; setTimeout(() => stop.abort(), 200);
      return joining;
    }, stop.signal), code('cancelled'));
    assert.ok(started);
    assert.equal(await containers(), '');
  });

  await t.test('a job past its deadline ends with deadline and leaves no container', async () => {
    const short = await createMediaSandbox({ ...media.toolchain, timeoutMs: 3000 });
    try { await assert.rejects(short.use(clip, () => new Promise(() => {})), code('deadline')); } finally { await short.close(); }
    assert.equal(await containers(), '');
  });
});
