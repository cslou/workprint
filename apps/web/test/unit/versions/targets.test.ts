import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Version } from '@workprint/contracts';
import { savedTextTarget } from '../../../src/versions/targets.js';

const version = (kind: 'script' | 'reference' | 'storyboard', content: object): Extract<Version, { content: unknown }> => ({ id: 'v1', artifactId: 'artifact', kind, revision: 1, createdBy: 'human', createdAt: '2026-10-30T00:00:00Z', dependencies: [], content: JSON.parse(JSON.stringify(content)) });
test('Script mapping edits only the inspected single action and blocks compound or structurally changed continuation', () => {
  const original = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits.' }] }] };
  const base = version('script', original), target = savedTextTarget({ kind: 'script-action' });
  assert.equal(target.read(base), 'Ada waits.');
  const content = target.replace(base, 'Ada checks her ticket.');
  assert.deepEqual(content, { ...original, scenes: [{ ...original.scenes[0], script: [{ action: 'Ada checks her ticket.' }] }] });
  assert.deepEqual(base, version('script', original));
  const latest = { ...version('script', content!), id: 'v2', revision: 2 };
  assert.equal(target.compatible(base, latest), true);
  const compound = version('script', { ...original, scenes: [{ ...original.scenes[0], script: [{ action: 'Ada waits.' }, { dialogue: { character: 'Ada', text: 'Is the train here?' } }] }] });
  assert.equal(target.read(compound), null); assert.equal(target.replace(compound, 'Never flatten this.'), null); assert.equal(target.compatible(base, compound), false);
  const changed = version('script', { ...original, scenes: [{ ...original.scenes[0], heading: { setting: 'exterior', location: 'Platform', time: 'night' } }] });
  assert.equal(target.compatible(base, changed), false); assert.equal(target.replace(base, '   '), null);
});
test('reference description and stable planning targets preserve every unrelated field, order and exact dependency', () => {
  const original = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller.', continuityNotes: ['Keep the coat.'] }, references: [] };
  const reference = version('reference', original), description = savedTextTarget({ kind: 'reference-description' });
  assert.deepEqual(description.replace(reference, 'A traveller in a green coat.'), { ...original, subject: { ...original.subject, description: 'A traveller in a green coat.' } });
  assert.equal(description.compatible(reference, version('reference', { ...original, subject: { ...original.subject, id: 'ben' } })), false);
  const content = { schemaVersion: 1, sourceScriptVersionId: 'script-v1', shots: [{ shotId: 'shot-a', order: 0, intent: 'Ada waits.', panels: [{ panelId: 'panel-a', order: 0, description: 'Ada beneath the clock.', references: ['reference-v1'] }, { panelId: 'panel-b', order: 1, description: 'The platform.', references: [] }] }] };
  const planning = { ...version('storyboard', content), dependencies: ['script-v1', 'reference-v1'] };
  const panel = savedTextTarget({ kind: 'panel', shotId: 'shot-a', panelId: 'panel-b' });
  const nextContent = panel.replace(planning, 'The train reaches the platform.');
  assert.deepEqual(nextContent, { ...content, shots: [{ ...content.shots[0], panels: [content.shots[0]!.panels[0], { ...content.shots[0]!.panels[1], description: 'The train reaches the platform.' }] }] });
  assert.equal(panel.compatible(planning, { ...planning, id: 'v2', revision: 2, content: nextContent! }), true);
  assert.equal(panel.compatible(planning, { ...planning, dependencies: ['script-v2', 'reference-v1'] }), false);
  assert.equal(panel.compatible(planning, { ...planning, content: { ...content, shots: [{ ...content.shots[0]!, panels: [...content.shots[0]!.panels].reverse() }] } }), false);
  assert.equal(savedTextTarget({ kind: 'panel', shotId: 'shot-a', panelId: 'missing' }).replace(planning, 'Never guess an index.'), null);
});
