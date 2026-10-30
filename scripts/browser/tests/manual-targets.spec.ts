import { test, expect } from '../material-network.js';
import type { Version } from '../../../packages/contracts/src/index.js';
import { savedTextTarget } from '../../../apps/web/src/versions/targets.js';

const version = (kind: 'script' | 'reference' | 'storyboard', content: object): Extract<Version, { content: unknown }> => ({ id: 'v1', artifactId: 'artifact', kind, revision: 1, createdBy: 'human', createdAt: '2026-10-30T00:00:00Z', dependencies: [], content: JSON.parse(JSON.stringify(content)) });
test('Script mapping edits only the inspected single action and blocks compound or structurally changed continuation', () => {
  const original = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits.' }] }] };
  const base = version('script', original), target = savedTextTarget({ kind: 'script-action' });
  expect(target.read(base)).toBe('Ada waits.');
  const content = target.replace(base, 'Ada checks her ticket.');
  expect(content).toEqual({ ...original, scenes: [{ ...original.scenes[0], script: [{ action: 'Ada checks her ticket.' }] }] });
  expect(base).toEqual(version('script', original));
  const latest = { ...version('script', content!), id: 'v2', revision: 2 };
  expect(target.compatible(base, latest)).toBe(true);
  const compound = version('script', { ...original, scenes: [{ ...original.scenes[0], script: [{ action: 'Ada waits.' }, { dialogue: { character: 'Ada', text: 'Is the train here?' } }] }] });
  expect(target.read(compound)).toBeNull(); expect(target.replace(compound, 'Never flatten this.')).toBeNull(); expect(target.compatible(base, compound)).toBe(false);
  const changed = version('script', { ...original, scenes: [{ ...original.scenes[0], heading: { setting: 'exterior', location: 'Platform', time: 'night' } }] });
  expect(target.compatible(base, changed)).toBe(false); expect(target.replace(base, '   ')).toBeNull();
});
test('reference description and stable planning targets preserve every unrelated field, order and exact dependency', () => {
  const original = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller.', continuityNotes: ['Keep the coat.'] }, references: [] };
  const reference = version('reference', original), description = savedTextTarget({ kind: 'reference-description' });
  expect(description.replace(reference, 'A traveller in a green coat.')).toEqual({ ...original, subject: { ...original.subject, description: 'A traveller in a green coat.' } });
  expect(description.compatible(reference, version('reference', { ...original, subject: { ...original.subject, id: 'ben' } }))).toBe(false);
  const content = { schemaVersion: 1, sourceScriptVersionId: 'script-v1', shots: [{ shotId: 'shot-a', order: 0, intent: 'Ada waits.', panels: [{ panelId: 'panel-a', order: 0, description: 'Ada beneath the clock.', references: ['reference-v1'] }, { panelId: 'panel-b', order: 1, description: 'The platform.', references: [] }] }] };
  const planning = { ...version('storyboard', content), dependencies: ['script-v1', 'reference-v1'] };
  const panel = savedTextTarget({ kind: 'panel', shotId: 'shot-a', panelId: 'panel-b' });
  const nextContent = panel.replace(planning, 'The train reaches the platform.');
  expect(nextContent).toEqual({ ...content, shots: [{ ...content.shots[0], panels: [content.shots[0]!.panels[0], { ...content.shots[0]!.panels[1], description: 'The train reaches the platform.' }] }] });
  expect(panel.compatible(planning, { ...planning, id: 'v2', revision: 2, content: nextContent! })).toBe(true);
  expect(panel.compatible(planning, { ...planning, dependencies: ['script-v2', 'reference-v1'] })).toBe(false);
  expect(panel.compatible(planning, version('storyboard', { ...content, shots: [{ ...content.shots[0], panels: [...content.shots[0]!.panels].reverse() }] }))).toBe(false);
  expect(savedTextTarget({ kind: 'panel', shotId: 'shot-a', panelId: 'missing' }).replace(planning, 'Never guess an index.')).toBeNull();
});
