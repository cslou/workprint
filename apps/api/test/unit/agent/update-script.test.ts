import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionTools, projectToolActivity, type AgentCollaborators } from '../../../src/agent/index.js';
import type { AssistantScriptOutcome } from '../../../src/application/index.js';
import { ScriptSubjectsError, type SubjectInput } from '../../../src/artifacts/index.js';
import { withSubjects } from '../../../src/artifacts/script-subjects.js';

const tool = productionTools.find(candidate => candidate.id === 'update-script')!;
const body = (characters: string[]) => ({ schemaVersion: 1 as const, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters, script: [{ action: 'Mara waits.' }] }] });
const stored = { ...body(['Mara']), subjects: [{ id: 'mara', kind: 'character' as const, name: 'Mara' }, { id: 'the-gallery', kind: 'place' as const, name: 'The Gallery' }] };

/** One update-script call against a save that answers `outcome`; returns the result, its line and what the save received. */
async function call(args: Record<string, unknown>, outcome: AssistantScriptOutcome = { kind: 'saved', versionId: 'v2', revision: 2 }) {
  const received: unknown[] = [];
  const collaborators: AgentCollaborators = { readWorkspace: async () => ({ kind: 'not_found' }), readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }),
    saveScript: async (_account, _video, input) => { received.push(input); return outcome; } };
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) return { parsed: false as const, received };
  const signal = new AbortController().signal;
  const result = await tool.execute(parsed.data, { scope: { accountId: 'a', videoId: 'v' }, collaborators, signal, abortReason: () => undefined }) as { message?: string };
  const line = projectToolActivity(productionTools, { toolCallId: 'c', toolName: 'update-script', state: 'done', input: args, output: result });
  return { parsed: true as const, result, summary: line?.summary, received };
}

test('the model never chooses subject ids: a script.subjects key is refused, and subjects go beside the script', async () => {
  assert.equal((await call({ baseVersionId: null, script: stored })).parsed, false);
  const sent = await call({ baseVersionId: null, script: body(['Mara']), subjects: [{ kind: 'character', name: 'Mara' }] });
  assert.deepEqual(sent.received, [{ content: body(['Mara']), baseVersionId: null, subjects: [{ id: '', kind: 'character', name: 'Mara' }] }]);
  assert.deepEqual((await call({ baseVersionId: null, script: body(['Mara']) })).received, [{ content: body(['Mara']), baseVersionId: null, subjects: [] }]);
});

test('"null" and empty ids are new, base ids are kept through a rename, and an unknown id is refused', () => {
  const subjects = (list: SubjectInput[]) => withSubjects(body(['ignored']), stored, list);
  const renamed = subjects([{ id: 'mara', kind: 'character', name: ' Mara Vale ' }, { id: 'null', kind: 'prop', name: 'The key' }, { id: ' ', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }]);
  assert.deepEqual(renamed.subjects, [{ id: 'mara', kind: 'character', name: 'Mara Vale' }, { id: 'the-key', kind: 'prop', name: 'The key' }, { id: 'mara-2', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }]);
  assert.deepEqual(renamed.scenes[0]!.characters, ['Mara Vale', 'Mara'], 'characters follow the character subjects');
  assert.throws(() => subjects([{ id: 'ben', kind: 'character', name: 'Ben' }]), (error: unknown) => error instanceof ScriptSubjectsError && error.reason === 'unknown_id');
  assert.throws(() => subjects([{ id: 'mara', kind: 'character', name: 'A' }, { id: 'mara', kind: 'character', name: 'B' }]), (error: unknown) => error instanceof ScriptSubjectsError && error.reason === 'unknown_id');
  // An empty list keeps the stored subjects while the characters match; a first save stores the derived ones.
  assert.deepEqual(withSubjects(body(['Mara']), stored, []).subjects, stored.subjects);
  assert.throws(() => withSubjects(body(['Mara', 'Ben']), stored, []), (error: unknown) => error instanceof ScriptSubjectsError && error.reason === 'differ');
  assert.deepEqual(withSubjects(body(['Mara']), null, []).subjects, stored.subjects);
});

test('the mismatch and invalid lines tell the model what to change', async () => {
  const differ = await call({ baseVersionId: 'v1', script: body(['Mara', 'Ben']) }, { kind: 'subjects_differ' });
  assert.equal(differ.summary, 'Not saved: the characters and subjects differ');
  assert.equal(differ.result?.message, 'Not saved: the characters and subjects differ; pass the full subjects list.');
  const invalid = await call({ baseVersionId: 'v1', script: body(['Mara']) }, { kind: 'invalid' });
  assert.equal(invalid.summary, 'Not saved: the script isn’t valid');
  assert.match(invalid.result?.message ?? '', /every speaker must be a character subject unless voice-over/i);
  const unknown = await call({ baseVersionId: 'v1', script: body(['Mara']), subjects: [{ id: 'ben', kind: 'character', name: 'Ben' }] }, { kind: 'invalid', field: 'subjects' });
  assert.match(unknown.result?.message ?? '', /Keep each subject's id from read-workspace/);
});
