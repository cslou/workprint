import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

// Dynamic loading allows the pre-implementation test to fail at runtime, not compilation.
async function parser() {
  const module = await import(pathToFileURL(resolve('apps/api/.test-build/src/artifacts/content.js')).href) as { parseContent(kind: string, value: unknown): unknown };
  return module.parseContent;
}
const script = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada puts her bag on the bench.' }, { dialogue: { character: 'Ada', text: 'The train is late.' } }] }] };

test('stored Script content preserves ordered action and speaker rules without importing local file workflows', async () => {
  const parse = await parser();
  assert.deepEqual(parse('script', script), script);
  const scene = script.scenes[0]!;
  for (const value of [
    { ...script, schemaVersion: 2 }, { ...script, approved: true }, { ...script, scenes: [] },
    { ...script, scenes: [{ ...scene, characters: ['Ada', 'Ada'] }] },
    { ...script, scenes: [{ ...scene, script: [{ action: ' ' }] }] },
    { ...script, scenes: [{ ...scene, script: [{ action: 'Ada sits.', dialogue: { character: 'Ada', text: 'Hi' } }] }] },
    { ...script, scenes: [{ ...scene, script: [{ dialogue: { character: 'Ben', text: 'Hi', delivery: 'off_screen' } }] }] },
    { ...script, scenes: [{ ...scene, camera: 'wide' }] },
  ]) assert.throws(() => parse('script', value), /./, 'Invalid Script must not become stored content');
  assert.doesNotThrow(() => parse('script', { ...script, scenes: [{ ...scene, script: [{ dialogue: { character: 'Ben', text: 'Tomorrow.', delivery: 'voice_over' } }] }] }));
});

test('stored reference content has explicit kind, continuity and exact version references, never file paths or approval', async () => {
  const parse = await parser();
  const reference = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada', description: 'A traveller in a green coat.', continuityNotes: ['Keep the green coat.'] }, references: [] };
  assert.deepEqual(parse('reference', reference), reference, 'Text-only references are valid before media exists');
  for (const value of [
    { ...reference, subject: { ...reference.subject, kind: 'camera' } },
    { ...reference, subject: { ...reference.subject, continuityNotes: [] } },
    { ...reference, references: [{ path: '/private/image.png', view: 'Front', notes: [] }] },
    { ...reference, approved: true },
    { ...reference, references: [{ versionId: 'image-v1', view: 'Front', notes: [] }, { versionId: 'image-v1', view: 'Back', notes: [] }] },
  ]) assert.throws(() => parse('reference', value));
});

test('stored planning keeps stable Shot and Panel identities with unique orders and no generated-image claims', async () => {
  const parse = await parser();
  const panel = { panelId: 'panel-one', order: 0, description: 'Ada waits on the bench.', references: [] };
  const shot = { shotId: 'shot-one', order: 0, intent: 'Establish the wait', panels: [panel] };
  const plan = { schemaVersion: 1, sourceScriptVersionId: 'script-v1', shots: [shot] };
  assert.deepEqual(parse('storyboard', plan), plan);
  for (const value of [
    { ...plan, shots: [shot, shot] },
    { ...plan, shots: [{ ...shot, panels: [panel, panel] }] },
    { ...plan, shots: [{ ...shot, panels: [{ ...panel, image: 'invented.png' }] }] },
    { ...plan, shots: [{ ...shot, panels: [{ ...panel, order: -1 }] }] },
  ]) assert.throws(() => parse('storyboard', value));
  assert.throws(() => parse('image', {}), /./, 'Media publication belongs to the later verified-upload boundary');
});
