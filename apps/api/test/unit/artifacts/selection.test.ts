import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedShots } from '../../../src/artifacts/selection.js';

const panel = (order: number) => ({ panelId: `p${order}`, order, description: `Panel ${order}`, references: [] });
const shot = (shotId: string, order: number, fields: Record<string, unknown> = {}) => ({ shotId, order, intent: `${shotId} happens.`, panels: [panel(0), panel(1)], ...fields });
const plan = (...shots: ReturnType<typeof shot>[]) => ({ shots });

test('a Shot whose own fields change is changed, so its panel images and videos are journalled as affected', () => {
  const before = plan(shot('s1', 0), shot('s2', 1));
  for (const fields of [{ framing: 'close' }, { action: 'Mara runs.' }, { dialogue: [{ speaker: 'Mara', text: 'Hello?', delivery: 'on_screen' }] },
    { cameraNote: 'Slow push in.' }, { references: [{ subjectId: 'mara', role: 'identity', purpose: 'Her face.' }] }]) {
    assert.deepEqual([...changedShots(before, plan(shot('s1', 0, fields), shot('s2', 1)))], ['s1'], JSON.stringify(fields));
  }
});

test('reordering Shots or listing panels in another order changes no Shot; a removed Shot is changed', () => {
  const before = plan(shot('s1', 0), shot('s2', 1));
  assert.deepEqual([...changedShots(before, plan(shot('s2', 0), shot('s1', 1)))], []);
  assert.deepEqual([...changedShots(before, plan({ ...shot('s1', 0), panels: [panel(1), panel(0)] }, shot('s2', 1)))], []);
  assert.deepEqual([...changedShots(before, plan(shot('s1', 0)))], ['s2']);
});
