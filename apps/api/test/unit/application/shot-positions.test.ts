import assert from 'node:assert/strict';
import { test } from 'node:test';
import { positionLines, type OwnedWorkspace } from '../../../src/application/index.js';

type Shot = OwnedWorkspace['storyboard']['shots'][number];

const at = (place: string) => [{ subjectId: place, role: 'environment' as const, purpose: 'The room.' }];
const shot = (shotId: string, order: number, fields: Partial<Shot> = {}): Shot => ({ shotId, order, intent: 'Mara moves.', panels: [], chosenVideoVersionId: null, ...fields });
const walk = { start: 'Mara enters frame left, walking toward frame right.', end: 'Mara kneels at the bench, frame right.' };
const kneel = { start: 'Mara kneels at the bench, frame right', end: 'Mara stands with the key, facing the camera;' };

test('a Shot\'s positions, then the previous Shot\'s end when the action can carry on', () => {
  const first = shot('s1', 0, { references: at('the-gallery'), positions: walk }), second = shot('s2', 1, { references: at('the-gallery'), positions: kneel });
  // Story order, not array order; each line ends once, whatever the position's own punctuation.
  assert.deepEqual(positionLines([second, first], first), ['Positions: starts Mara enters frame left, walking toward frame right; ends Mara kneels at the bench, frame right.']);
  assert.deepEqual(positionLines([second, first], second), ['Positions: starts Mara kneels at the bench, frame right; ends Mara stands with the key, facing the camera.', 'Previous Shot ended: Mara kneels at the bench, frame right.']);
  // Another place: the previous end doesn't carry on. Neither naming a place: it does.
  assert.deepEqual(positionLines([first, { ...second, references: at('the-street') }], { ...second, references: at('the-street') }).length, 1);
  const unplaced = [shot('s1', 0, { positions: walk }), shot('s2', 1, { positions: kneel })];
  assert.equal(positionLines(unplaced, unplaced[1]!)[1], 'Previous Shot ended: Mara kneels at the bench, frame right.');
  // What's missing gives no line: a Shot without positions, a previous Shot without them.
  const bare = shot('s2', 1, { references: at('the-gallery') });
  assert.deepEqual(positionLines([first, bare], bare), ['Previous Shot ended: Mara kneels at the bench, frame right.']);
  assert.deepEqual(positionLines([shot('s1', 0, { references: at('the-gallery') }), bare], bare), []);
});
