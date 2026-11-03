import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OperationResponse } from '@workprint/contracts';
import { deliveryLabel, shotsLabel, subjectShotNumbers } from '../../../src/workspace/projection.js';

type Shot = OperationResponse<'workspace'>['storyboard']['shots'][number];
const shot = (shotId: string, order: number, subjects: string[]): Shot => ({ shotId, order, panels: [], chosenVideoVersionId: null, candidateVideoVersions: [],
  references: subjects.map(subjectId => ({ subjectId, role: 'identity', purpose: 'Who is seen.' })) } as unknown as Shot);

test('a dialogue line is labelled by who is heard: on screen, off screen, a scene character\'s voice-over, or narration', () => {
  const characters = new Set(['Mara']);
  assert.equal(deliveryLabel({ character: ' Mara ', text: 'You came.' }, characters), 'Mara');
  assert.equal(deliveryLabel({ character: 'Mara', text: 'Wait.', delivery: 'off_screen' }, characters), 'Mara (off screen)');
  assert.equal(deliveryLabel({ character: 'Mara', text: 'I knew.', delivery: 'voice_over' }, characters), 'Mara (voice-over)');
  assert.equal(deliveryLabel({ character: 'Narrator', text: 'Years passed.', delivery: 'voice_over' }, characters), 'Narration');
});

test('a subject\'s Shots are numbered in storyboard order and read as a list', () => {
  const shots = [shot('b', 2, ['mara']), shot('a', 0, ['mara', 'gallery']), shot('c', 1, ['gallery'])];
  assert.deepEqual(subjectShotNumbers(shots, 'mara'), [1, 3]);
  assert.deepEqual(subjectShotNumbers(shots, 'ben'), []);
  assert.deepEqual(subjectShotNumbers([shot('a', 0, ['mara']), shot('b', 0, ['mara'])], 'mara'), [], 'a storyboard that can\'t be ordered names no Shots');
  assert.deepEqual([[], [1], [1, 2], [1, 2, 3]].map(shotsLabel), ['', 'Shot 1', 'Shots 1 and 2', 'Shots 1, 2 and 3']);
});
