import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssistantSheets } from '../../../src/application/index.js';
import { ArtifactError, SheetSaveError, UploadError } from '../../../src/artifacts/index.js';

const input = { subjectId: 'mara', description: 'Private description', continuityNotes: ['Private note'], views: [{ versionId: 'v1', view: 'Front', notes: [] }], baseVersionId: null };
const failing = (error: unknown) => createAssistantSheets({ save: async () => { throw error; }, useRoom: async () => { throw error; }, view: async () => { throw error; } });

test('each sheet save result maps to its outcome with its payload', async () => {
  const saved = createAssistantSheets({ save: async () => ({ version: { id: 'sheet-v2', revision: 2 }, subjectName: 'Mara Vale' }) as never, useRoom: async () => 7, view: async () => ({ id: 'view-v1' }) as never });
  assert.deepEqual(await saved.save('a', 'v', input), { kind: 'saved', versionId: 'sheet-v2', revision: 2, subjectName: 'Mara Vale' });
  assert.deepEqual(await saved.useRoom('a', 'v'), { kind: 'room', room: 7 });
  for (const reason of ['no_script', 'not_in_script', 'not_found', 'stale', 'no_room'] as const) assert.deepEqual(await failing(new SheetSaveError(reason)).save('a', 'v', input), { kind: reason });
  assert.deepEqual(await failing(new SheetSaveError('invalid', 'images')).save('a', 'v', input), { kind: 'invalid', field: 'images' });
  assert.deepEqual(await failing(new SheetSaveError('invalid', 'text')).save('a', 'v', input), { kind: 'invalid', field: 'text' });
  assert.deepEqual(await failing(new SheetSaveError('in_other_sheet', 'Mara')).save('a', 'v', input), { kind: 'in_other_sheet', subjectName: 'Mara' });
  assert.deepEqual(await failing(new ArtifactError('not_found')).save('a', 'v', input), { kind: 'not_found' });
  assert.deepEqual(await failing(new ArtifactError('not_found')).useRoom('a', 'v'), { kind: 'not_found' });
  assert.deepEqual(await saved.readView('a', 'v', 'view-v1'), { kind: 'found', version: { id: 'view-v1' } });
  assert.deepEqual(await failing(new ArtifactError('not_found')).readView('a', 'v', 'x'), { kind: 'not_found' });
});

test('an integration failure is unavailable and is logged by name and code only, never content', async t => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  assert.deepEqual(await failing(new ArtifactError('integration_failure')).save('a', 'v', input), { kind: 'unavailable' });
  assert.deepEqual(await failing(new UploadError('integration_failure')).save('a', 'v', input), { kind: 'unavailable' });
  assert.deepEqual(await failing(new Error('Private description leaked')).useRoom('a', 'v'), { kind: 'unavailable' });
  assert.deepEqual(await failing(new ArtifactError('integration_failure')).readView('a', 'v', 'x'), { kind: 'unavailable' });
  assert.equal(logged.length, 4);
  assert.deepEqual(logged[0], ['Assistant sheet save failed', { name: 'Error', code: 'integration_failure' }]);
  assert.doesNotMatch(JSON.stringify(logged), /Private/);
});
