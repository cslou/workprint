import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BrowserClient } from '../../../src/api/client.js';
import { editedShots, lengthText, positionsEdit, positionsText, shotLengthSeconds, storyboardEditable } from '../../../src/storyboard/storyboard-edit.js';

test('a typed Shot length is a whole number of seconds from 4 to 15, and anything else is refused', () => {
  for (const [typed, seconds] of [['4', 4], ['15', 15], [' 8 ', 8]] as const) assert.equal(shotLengthSeconds(typed), seconds, typed);
  for (const typed of ['3', '16', '6.5', '', 'six', '-6', '1e1']) assert.equal(shotLengthSeconds(typed), null, typed);
  assert.deepEqual([lengthText(6), lengthText(undefined)], ['Length · 6 s', 'Length · not set']);
});

test('only a saved, non-built-in storyboard with a configured connection and a video is editable', () => {
  const configured = { kind: 'configured', client: {} } as BrowserClient, scope = { accountId: 'a', conversationId: 'c' };
  const version = { id: 'v', artifactId: 's', revision: 1, kind: 'storyboard', content: {} } as never;
  assert.equal(storyboardEditable(version, configured, scope as never), true);
  assert.equal(storyboardEditable({ ...(version as object), builtIn: true } as never, configured, scope as never), false, 'a built-in storyboard');
  assert.equal(storyboardEditable(version, { kind: 'missing' }, scope as never), false, 'no connection');
  assert.equal(storyboardEditable(version, configured, null), false, 'no video');
  assert.equal(storyboardEditable(undefined, configured, scope as never), false, 'no storyboard');
});

test('an edit sends every Shot with only the one change applied', () => {
  const shots = [
    { shotId: 's1', order: 0, intent: 'Arrive.', durationS: 6, panels: [{ panelId: 'p1', order: 0, description: 'Door.', references: ['r'] }] },
    { shotId: 's2', order: 1, panels: [{ panelId: 'p2', order: 0, description: 'Dark.', references: [] }] },
  ] as never;
  assert.deepEqual(editedShots(shots, { shotId: 's2', durationS: 8 }), [
    { shotId: 's1', order: 0, intent: 'Arrive.', panels: [{ panelId: 'p1', order: 0, description: 'Door.', references: ['r'] }] },
    { shotId: 's2', order: 1, durationS: 8, panels: [{ panelId: 'p2', order: 0, description: 'Dark.', references: [] }] },
  ]);
  assert.deepEqual(editedShots(shots, { shotId: 's1', panel: { panelId: 'p1', description: 'The door.' } })[0]!.panels[0]!.description, 'The door.');
  assert.equal(editedShots(shots, { shotId: 's1', intent: 'Arrives.' })[0]!.intent, 'Arrives.');
  // A positions edit carries only that Shot's positions.
  const moved = editedShots(shots, { shotId: 's2', positions: { start: 'A', end: 'B' } });
  assert.deepEqual([moved[0]!.positions, moved[1]!.positions], [undefined, { start: 'A', end: 'B' }]);
});

test('positions read "Starts: … / Ends: …" or "not set"; both are needed, and the same ones change nothing', () => {
  assert.deepEqual([positionsText({ start: 'Left.', end: 'Right.' }), positionsText(undefined)], ['Starts: Left. / Ends: Right.', 'Positions · not set']);
  const current = { start: 'Left.', end: 'Right.' };
  for (const [start, end] of [['', 'Right.'], ['Left.', '  '], ['x'.repeat(301), 'Right.']]) assert.deepEqual(positionsEdit(current, start!, end!), { kind: 'missing' }, start);
  assert.deepEqual(positionsEdit(current, ' Left. ', 'Right.'), { kind: 'unchanged' });
  assert.deepEqual(positionsEdit(undefined, 'Left.', ' Right. '), { kind: 'changed', positions: { start: 'Left.', end: 'Right.' } }, 'an earlier Shot gains both');
});
