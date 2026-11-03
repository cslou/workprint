import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OperationResponse } from '@workprint/contracts';
import { subjectShotNumbers } from '../../../src/workspace/projection.js';

type Shot = OperationResponse<'workspace'>['storyboard']['shots'][number];
const shot = (shotId: string, order: number, subjects: string[]): Shot => ({ shotId, order, panels: [], chosenVideoVersionId: null, candidateVideoVersions: [],
  references: subjects.map(subjectId => ({ subjectId, role: 'identity', purpose: 'Who is seen.' })) } as unknown as Shot);

test('a subject\'s Shots are numbered in storyboard order', () => {
  const shots = [shot('b', 2, ['mara']), shot('a', 0, ['mara', 'gallery']), shot('c', 1, ['gallery'])];
  assert.deepEqual(subjectShotNumbers(shots, 'mara'), [1, 3]);
  assert.deepEqual(subjectShotNumbers(shots, 'ben'), []);
  assert.deepEqual(subjectShotNumbers([shot('a', 0, ['mara']), shot('b', 0, ['mara'])], 'mara'), [], 'a storyboard that can\'t be ordered names no Shots');
});
