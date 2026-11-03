import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { savedStoryboardContentSchema, storyboardEditSchema } from '@workprint/contracts';

const shotId = randomUUID(), panelId = randomUUID();
const board = (fields: Record<string, unknown> = {}) => ({ schemaVersion: 1, sourceScriptVersionId: randomUUID(),
  shots: [{ shotId, order: 0, intent: 'Mara arrives.', ...fields, panels: [{ panelId, order: 0, description: 'In the doorway.', references: [] }] }] });
const edit = (fields: Record<string, unknown> = {}) => [{ shotId, order: 0, ...fields, panels: [{ panelId, order: 0, references: [] }] }];

test('a Shot\'s length is a whole number of seconds from 4 to 15, and a storyboard saved without one stays valid', () => {
  assert.equal(savedStoryboardContentSchema.safeParse(board()).success, true, 'an older storyboard has no length');
  for (const durationS of [4, 15]) {
    assert.equal(savedStoryboardContentSchema.safeParse(board({ durationS })).success, true, String(durationS));
    assert.equal(storyboardEditSchema.safeParse(edit({ durationS })).success, true, `edit ${durationS}`);
  }
  for (const durationS of [3, 16, 6.5, '6']) {
    assert.equal(savedStoryboardContentSchema.safeParse(board({ durationS })).success, false, String(durationS));
    assert.equal(storyboardEditSchema.safeParse(edit({ durationS })).success, false, `edit ${String(durationS)}`);
  }
  assert.equal(storyboardEditSchema.safeParse(edit()).success, true, 'an edit may leave the length alone');
});
