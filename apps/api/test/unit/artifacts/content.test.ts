import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseContent } from '../../../src/artifacts/content.js';

const script = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada puts her bag on the bench.' }, { dialogue: { character: 'Ada', text: 'The train is late.' } }] }] };

test('stored Script content preserves ordered action and speaker rules without importing local file workflows', async () => {
  assert.deepEqual(parseContent('script', script), script);
  const scene = script.scenes[0]!;
  for (const value of [
    { ...script, schemaVersion: 2 }, { ...script, approved: true }, { ...script, scenes: [] },
    { ...script, scenes: [{ ...scene, characters: ['Ada', 'Ada'] }] },
    { ...script, scenes: [{ ...scene, script: [{ action: ' ' }] }] },
    { ...script, scenes: [{ ...scene, script: [{ action: 'Ada sits.', dialogue: { character: 'Ada', text: 'Hi' } }] }] },
    { ...script, scenes: [{ ...scene, script: [{ dialogue: { character: 'Ben', text: 'Hi', delivery: 'off_screen' } }] }] },
    { ...script, scenes: [{ ...scene, camera: 'wide' }] },
  ]) assert.throws(() => parseContent('script', value), /./, 'Invalid Script must not become stored content');
  assert.doesNotThrow(() => parseContent('script', { ...script, scenes: [{ ...scene, script: [{ dialogue: { character: 'Ben', text: 'Tomorrow.', delivery: 'voice_over' } }] }] }));
});

test('stored reference content has explicit kind, continuity and exact version references, never file paths or approval', async () => {
  const reference = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada', description: 'A traveller in a green coat.', continuityNotes: ['Keep the green coat.'] }, references: [] };
  assert.deepEqual(parseContent('reference', reference), reference, 'Text-only references are valid before media exists');
  for (const value of [
    { ...reference, subject: { ...reference.subject, kind: 'camera' } },
    { ...reference, subject: { ...reference.subject, continuityNotes: [] } },
    { ...reference, references: [{ path: '/private/image.png', view: 'Front', notes: [] }] },
    { ...reference, approved: true },
    { ...reference, references: [{ versionId: 'image-v1', view: 'Front', notes: [] }, { versionId: 'image-v1', view: 'Back', notes: [] }] },
  ]) assert.throws(() => parseContent('reference', value));
  // People's sheets may hold more than the assistant's 5 views and stay valid.
  const six = Array.from({ length: 6 }, (_, index) => ({ versionId: `image-v${index}`, view: `View ${index}`, notes: [] }));
  assert.deepEqual(parseContent('reference', { ...reference, references: six }), { ...reference, references: six });
});

test('stored planning keeps stable Shot and Panel identities with unique orders and no generated-image claims', async () => {
  const panel = { panelId: 'panel-one', order: 0, description: 'Ada waits on the bench.', references: [] };
  const shot = { shotId: 'shot-one', order: 0, intent: 'Establish the wait', panels: [panel] };
  const plan = { schemaVersion: 1, sourceScriptVersionId: 'script-v1', shots: [shot] };
  assert.deepEqual(parseContent('storyboard', plan), plan);
  for (const value of [
    { ...plan, shots: [shot, shot] },
    { ...plan, shots: [{ ...shot, panels: [panel, panel] }] },
    { ...plan, shots: [{ ...shot, panels: [{ ...panel, image: 'invented.png' }] }] },
    { ...plan, shots: [{ ...shot, panels: [{ ...panel, order: -1 }] }] },
  ]) assert.throws(() => parseContent('storyboard', value));
  assert.throws(() => parseContent('image', {}), /./, 'Media publication belongs to the later verified-upload boundary');
});

test('an assistant storyboard\'s Shot fields parse, an old storyboard without them still parses, and their bounds hold', () => {
  const panel = { panelId: 'panel-one', order: 0, description: 'Mara at the door.', references: [] };
  const reference = (subjectId: string) => ({ subjectId, role: 'composition', purpose: 'Keep the doorway.' });
  const shot = { shotId: 'shot-one', order: 0, intent: 'Mara arrives', framing: 'wide', action: 'Mara steps in out of the rain.', cameraNote: 'Slow push in.',
    dialogue: [{ character: 'Mara', text: 'Anyone here?' }, { character: 'Narrator', text: 'It was late.', delivery: 'voice_over' }],
    references: [{ subjectId: 'mara', role: 'identity', purpose: 'Her face and coat.' }, { subjectId: 'the-gallery', role: 'environment', purpose: 'The room.' }], panels: [panel] };
  const plan = { schemaVersion: 1, sourceScriptVersionId: 'script-v1', shots: [shot] };
  assert.deepEqual(parseContent('storyboard', plan), plan);
  const old = { schemaVersion: 1, sourceScriptVersionId: 'script-v1', shots: [{ shotId: 'shot-one', order: 0, intent: 'Mara arrives', panels: [panel] }] };
  assert.deepEqual(parseContent('storyboard', old), old);
  for (const value of [
    { ...plan, shots: [{ ...shot, framing: 'x'.repeat(81) }] },
    { ...plan, shots: [{ ...shot, references: Array.from({ length: 11 }, (_, n) => reference(`subject-${n}`)) }] },
    { ...plan, shots: [{ ...shot, references: [reference('mara'), reference('mara')] }] },
    { ...plan, shots: [{ ...shot, references: [{ ...reference('mara'), purpose: 'x'.repeat(121) }] }] },
    { ...plan, shots: [{ ...shot, references: [{ ...reference('mara'), role: 'lighting' }] }] },
    { ...plan, shots: [{ ...shot, action: 'x'.repeat(2001) }] },
    { ...plan, shots: [{ ...shot, dialogue: Array.from({ length: 21 }, () => ({ character: 'Mara', text: 'Again.' })) }] },
  ]) assert.throws(() => parseContent('storyboard', value));
  const ten = parseContent('storyboard', { ...plan, shots: [{ ...shot, references: Array.from({ length: 10 }, (_, n) => reference(`subject-${n}`)) }] });
  assert.ok('shots' in ten);
  assert.equal(ten.shots[0]!.references!.length, 10);
});
