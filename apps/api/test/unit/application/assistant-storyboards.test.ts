import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssistantStoryboardSaver } from '../../../src/application/index.js';
import { ArtifactError, StoryboardSaveError } from '../../../src/artifacts/index.js';

const input = { baseVersionId: null, shots: [{ shotId: '', intent: 'Private intent', panels: [{ panelId: '', description: 'Private panel' }] }] };
const failing = (error: unknown) => createAssistantStoryboardSaver(async () => { throw error; });

test('each storyboard save result maps to its outcome with its field', async () => {
  const saved = createAssistantStoryboardSaver(async () => ({ version: { id: 'board-v2', revision: 2 } }) as never);
  assert.deepEqual(await saved('a', 'v', input), { kind: 'saved', versionId: 'board-v2', revision: 2 });
  for (const reason of ['no_script', 'no_room'] as const) assert.deepEqual(await failing(new StoryboardSaveError(reason))('a', 'v', input), { kind: reason });
  for (const reason of ['not_in_script', 'role', 'invalid'] as const) assert.deepEqual(await failing(new StoryboardSaveError(reason, 'shots[1].references[0].subjectId'))('a', 'v', input), { kind: reason, field: 'shots[1].references[0].subjectId' });
  assert.deepEqual(await failing(new ArtifactError('stale_revision'))('a', 'v', input), { kind: 'stale' });
  assert.deepEqual(await failing(new ArtifactError('not_found'))('a', 'v', input), { kind: 'not_found' });
  assert.deepEqual(await failing(new ArtifactError('invalid_input'))('a', 'v', input), { kind: 'invalid', field: 'shots' });
});

test('a failed lookup or integration failure is unavailable and is logged by name and code only, never content', async t => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  assert.deepEqual(await failing(new ArtifactError('integration_failure'))('a', 'v', input), { kind: 'unavailable' });
  assert.deepEqual(await failing(new Error('Private intent leaked'))('a', 'v', input), { kind: 'unavailable' });
  assert.equal(logged.length, 2);
  assert.deepEqual(logged[0], ['Assistant storyboard save failed', { name: 'Error', code: 'integration_failure' }]);
  assert.doesNotMatch(JSON.stringify(logged), /Private/);
});
