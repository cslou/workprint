import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { UploadError, UseRoomError, type GeneratedVideoInput, type JoinedMedia } from '../../../src/artifacts/index.js';
import { createJoins, type JoinCollaborators } from '../../../src/application/index.js';
import { MediaProcessError } from '../../../src/storage/index.js';

const account = randomUUID(), video = randomUUID();
const [a, b, c, shotClip, big] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const clipVersion = (id: string, durationMs: number, byteSize = 10) => ({ id, kind: 'video', media: { contentType: 'video/mp4', byteSize, width: 1344, height: 768, durationMs } });
/** A workspace with two generated clips, an uploaded video, an image and one Shot video version. */
const workspace = {
  script: null, assets: [{ version: clipVersion(c, 70_000) }, { version: { id: randomUUID(), kind: 'image', media: { contentType: 'image/png', byteSize: 1, width: 1, height: 1 } } }],
  generatedVideos: [{ version: clipVersion(a, 4042) }, { version: clipVersion(b, 4042) }, { version: clipVersion(big, 4042, 100 * 1024 * 1024) }],
  storyboard: { work: null, shots: [{ shotId: randomUUID(), panels: [], chosenVideoVersionId: null, candidateVideoVersions: [clipVersion(shotClip, 60_000)] }] },
  videos: [], pendingQuestion: null, activeWork: [], selectionRevision: '0',
};
const joined: JoinedMedia = { kind: 'joined', bytes: Buffer.from('joined'), frames: 194, lengthS: 8.083334 };

/** Fake collaborators that record what reached them. */
function harness(overrides: Partial<JoinCollaborators> = {}) {
  const calls = { read: [] as string[], join: 0, save: [] as GeneratedVideoInput[] };
  const collaborators: JoinCollaborators = {
    reads: { workspace: async () => workspace as never },
    readClip: async (_account, id) => { calls.read.push(id); return { versionId: id, bytes: Buffer.from(id), durationMs: 4042 }; },
    join: async () => { calls.join += 1; return joined; },
    save: async (_account, _video, input) => {
      calls.save.push(input);
      return { version: { id: 'joined-version', kind: 'video', media: { contentType: 'video/mp4', byteSize: 6, width: 1344, height: 768, durationMs: 8083 } }, use: {}, gone: false } as never;
    },
    ...overrides,
  };
  return { join: createJoins(collaborators), calls };
}

test('clips this video uses are read in order, joined and saved with the clips as dependencies', async () => {
  const { join, calls } = harness();
  assert.deepEqual(await join(account, video, [a, shotClip]), { kind: 'joined', versionId: 'joined-version', width: 1344, height: 768, durationMs: 8083, clips: 2 });
  assert.deepEqual(calls.read, [a, shotClip]);
  assert.equal(calls.save.length, 1);
  assert.deepEqual({ ...calls.save[0], bytes: calls.save[0]!.bytes.toString() }, { bytes: 'joined', frames: [], joined: { clips: [a, shotClip], frameMs: 8083.334 / 194 } });
});

test('ids are checked before any bytes are read', async () => {
  for (const [clips, kind] of [
    [[a], 'invalid'], [Array.from({ length: 21 }, () => randomUUID()), 'invalid'], [[a, a], 'repeated'],
    [[a, randomUUID()], 'not_found'], [[a, workspace.assets[1]!.version.id], 'not_found'], [[c, shotClip], 'too_long'], [[a, big], 'too_large'],
  ] as const) {
    const { join, calls } = harness();
    const outcome = await join(account, video, clips);
    assert.equal(outcome.kind, kind);
    if (outcome.kind === 'too_long') assert.equal(outcome.lengthMs, 130_000);
    assert.deepEqual([calls.read, calls.join, calls.save.length], [[], 0, 0]);
  }
  // A foreign or unreadable video's workspace is not found, and nothing is read.
  const foreign = harness({ reads: { workspace: async () => { throw new UploadError('not_found'); } } });
  assert.equal((await foreign.join(account, video, [a, b])).kind, 'not_found');
  assert.deepEqual(foreign.calls.read, []);
});

test('an incompatible clip is named and nothing is saved', async () => {
  const { join, calls } = harness({ join: async () => ({ kind: 'incompatible', clip: 2, difference: '672×384; clip 1 is 1344×768' }) });
  assert.deepEqual(await join(account, video, [a, b]), { kind: 'incompatible', clip: 2, difference: '672×384; clip 1 is 1344×768' });
  assert.equal(calls.save.length, 0);
});

test('no room, failures and Stop each map to their outcome', async () => {
  assert.equal((await harness({ save: async () => { throw new UseRoomError(); } }).join(account, video, [a, b])).kind, 'no_room');
  assert.equal((await harness({ save: async () => { throw new UploadError('not_found'); } }).join(account, video, [a, b])).kind, 'not_found');
  for (const failure of [new UploadError('invalid_input'), new UploadError('unsupported'), new MediaProcessError('capacity'), new MediaProcessError('deadline'), new Error('storage')]) {
    assert.equal((await harness({ join: async () => { throw failure; } }).join(account, video, [a, b])).kind, 'unavailable');
  }
  // Stop: the signal fired, so nothing more is read, joined or saved.
  const controller = new AbortController();
  const stopped = harness({ readClip: async (_account, id) => { controller.abort(); return { versionId: id, bytes: Buffer.from(id), durationMs: 4042 }; } });
  assert.equal((await stopped.join(account, video, [a, b], controller.signal)).kind, 'stopped');
  assert.deepEqual([stopped.calls.join, stopped.calls.save.length], [0, 0]);
});
