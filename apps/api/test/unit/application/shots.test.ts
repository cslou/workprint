import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeShot, shotVideoPrompt, type NewVideo, type OwnedWorkspace, type ShotMakers } from '../../../src/application/index.js';

type Version = OwnedWorkspace['assets'][number]['version'];
type Shot = OwnedWorkspace['storyboard']['shots'][number];

const image = (id: string, revision = 1): Version => ({ id, artifactId: `artifact-${id}`, revision, createdBy: 'assistant', createdAt: `2026-11-03T10:00:0${revision}.000Z`, dependencies: [], kind: 'image', media: { contentType: 'image/png', byteSize: 10, width: 640, height: 360 } });
const panel = (panelId: string, order: number, candidates: Version[] = []) => ({ panelId, order, description: `Panel ${panelId}`, references: [], candidateImageVersions: candidates, approvedImageVersionId: null });
const shot = (fields: Partial<Shot> = {}): Shot => ({ shotId: 's1', order: 0, intent: 'Mara arrives.', panels: [panel('p1', 0, [image('a1')]), panel('p2', 1, [image('b1')])], chosenVideoVersionId: null, ...fields });
function workspace(shots: Shot[]): OwnedWorkspace {
  const script = { id: 'script', artifactId: 'artifact-script', revision: 1, createdBy: 'assistant', createdAt: '2026-11-03T10:00:00.000Z', dependencies: [], kind: 'script',
    content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: ['Mara', 'Ben'], script: [{ action: 'Mara waits.' }] }] } };
  return { script: { version: script, use: { id: 'use-script', versionId: 'script', binding: { purpose: 'script' }, state: 'draft' }, state: 'Draft' }, assets: [],
    storyboard: { work: null, shots }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 1 } as unknown as OwnedWorkspace;
}
const control = { signal: new AbortController().signal, abortReason: () => undefined };
/** Makers over one workspace; `started` keeps each video the job runner was asked for. */
function makers(shots: Shot[] | 'missing') {
  const started: NewVideo[] = [];
  const value: ShotMakers = {
    readWorkspace: async () => shots === 'missing' ? { kind: 'not_found' } : { kind: 'found', workspace: workspace(shots) },
    videos: { start: async (_account, _video, input) => { started.push(input); return { kind: 'no_room' }; } },
  };
  return { value, started };
}
const request = { shot: 's1', prompt: 'A slow push-in.' };

test('the prompt is the action and camera note, then each line as it is voiced, then the motion', () => {
  const characters = new Set(['Mara', 'Ben']);
  const dialogue = [{ character: ' Mara ', text: 'You came.' }, { character: 'Ben', text: 'I did.', delivery: 'off_screen' as const },
    { character: 'Mara', text: 'He always did.', delivery: 'voice_over' as const }, { character: 'Narrator', text: 'Years passed.', delivery: 'voice_over' as const }];
  assert.equal(shotVideoPrompt({ action: 'Mara turns to the door.', cameraNote: 'Low angle.', dialogue, intent: 'Unused.' }, characters, ' A slow push-in. '),
    'Mara turns to the door.\n\nLow angle.\n\nMara says: "You came."\nBen, off screen, says: "I did."\nMara, in voice-over, says: "He always did."\nNarrated in voice-over: "Years passed."\n\nA slow push-in.');
  assert.equal(shotVideoPrompt({ intent: 'Mara arrives.' }, characters, 'Pan left.'), 'Mara arrives.\n\nNo one speaks.\n\nPan left.', 'no action: the intent, and no one speaks');
});

test('the job runs for the Shot\'s length, or 6 s for a Shot saved without one', async () => {
  const timed = makers([shot({ durationS: 9 })]);
  await makeShot(timed.value, 'account', 'video', request, control);
  const untimed = makers([shot()]);
  await makeShot(untimed.value, 'account', 'video', request, control);
  assert.deepEqual([timed.started[0]?.durationS, untimed.started[0]?.durationS], [9, 6]);
});

test('a Shot\'s first and last panels are its frames, and the job carries the Shot', async () => {
  const two = makers([shot()]);
  assert.deepEqual(await makeShot(two.value, 'account', 'video', request, control), { kind: 'no_room' }, 'the job runner\'s outcome is returned');
  assert.deepEqual(two.started, [{ prompt: 'Mara arrives.\n\nNo one speaks.\n\nA slow push-in.', durationS: 6, ratio: '16:9', firstFrame: 'a1', lastFrame: 'b1', target: { shotId: 's1' } }]);
  // A person's Shot may have more panels, stored out of order: the first and last by order are the frames.
  const three = makers([shot({ panels: [panel('p3', 2, [image('c1')]), panel('p1', 0, [image('a1'), image('a2', 2)]), panel('p2', 1)] })]);
  await makeShot(three.value, 'account', 'video', request, control);
  assert.deepEqual([three.started[0]?.firstFrame, three.started[0]?.lastFrame], ['a2', 'c1'], 'each panel\'s current image');
  const one = makers([shot({ panels: [panel('p1', 0, [image('a1')])] })]);
  await makeShot(one.value, 'account', 'video', request, control);
  assert.deepEqual([one.started[0]?.firstFrame, 'lastFrame' in one.started[0]!], ['a1', false]);
  // A person chose one image for both panels: it is the first frame only, since MiniMax takes each image once.
  const same = makers([shot({ panels: [panel('p1', 0, [image('a1')]), panel('p2', 1, [image('a1')])] })]);
  await makeShot(same.value, 'account', 'video', request, control);
  assert.deepEqual([same.started[0]?.firstFrame, 'lastFrame' in same.started[0]!], ['a1', false]);
});

test('every refusal comes before the job runner is asked', async () => {
  const cases: [Shot[] | 'missing', Partial<typeof request>, string][] = [
    ['missing', {}, 'work_unavailable'],
    [[shot()], { shot: 'another' }, 'not_found'],
    [[shot({ panels: [panel('p1', 0, [image('a1')]), panel('p2', 1)] })], {}, 'needs_panels'],
    [[shot({ action: 'x'.repeat(6990) })], {}, 'too_long'],
  ];
  for (const [shots, change, reason] of cases) {
    const made = makers(shots);
    assert.deepEqual(await makeShot(made.value, 'account', 'video', { ...request, ...change }, control), { kind: 'shot_refused', reason }, reason);
    assert.deepEqual(made.started, []);
  }
  const unsaveable = makers([shot()]);
  assert.deepEqual(await makeShot({ readWorkspace: unsaveable.value.readWorkspace }, 'account', 'video', request, control), { kind: 'shot_refused', reason: 'unsaveable' });
});
