import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { productionTools, projectToolActivity, type AgentCollaborators } from '../../../src/agent/index.js';
import type { AssistantStoryboardOutcome } from '../../../src/application/index.js';
import type { AssistantStoryboardInput } from '../../../src/artifacts/index.js';
import { unusedSheets } from '../../support/unused-sheets.js';

const tool = productionTools.find(candidate => candidate.id === 'save-storyboard')!;
const shot = (extra: Record<string, unknown> = {}) => ({ intent: 'Mara arrives.', durationS: 6, panels: [{ description: 'Mara in the doorway.' }], ...extra });

/** One save-storyboard call against a save that answers `outcome`; returns the result, its line and what the save received. */
async function call(args: Record<string, unknown>, outcome: AssistantStoryboardOutcome = { kind: 'saved', versionId: 'board-v1', revision: 1 }) {
  const received: AssistantStoryboardInput[] = [];
  const collaborators: AgentCollaborators = { readWorkspace: async () => ({ kind: 'not_found' }), saveScript: async () => ({ kind: 'unavailable' }), readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }), sheets: unusedSheets,
    saveStoryboard: async (_account, _video, input) => { received.push(input); return outcome; } };
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) return { parsed: false as const, received };
  const result = await tool.execute(parsed.data, { scope: { accountId: 'a', videoId: 'v' }, collaborators, signal: new AbortController().signal, abortReason: () => undefined }) as { saved: boolean; message?: string; field?: string };
  const line = projectToolActivity(productionTools, { toolCallId: 'c', toolName: 'save-storyboard', state: 'done', input: args, output: result });
  return { parsed: true as const, result, summary: line?.summary, phrase: line?.phrase, received };
}

test('empty and "null" optional values are harmless: no base, new ids, no field, a line spoken on screen', async () => {
  const sent = await call({ base: ' null ', shots: [shot({ shotId: 'NULL', framing: 'null', action: '', cameraNote: ' ', dialogue: [{ character: 'Mara', text: 'Hello?', delivery: 'null' }], references: [{ subjectId: ' mara ', role: 'identity', purpose: 'Her face.' }], panels: [{ panelId: 'null', description: 'Mara in the doorway.' }] })] });
  assert.equal(sent.parsed, true);
  assert.deepEqual(sent.received, [{ baseVersionId: null, shots: [{ shotId: '', intent: 'Mara arrives.', durationS: 6, dialogue: [{ character: 'Mara', text: 'Hello?' }], references: [{ subjectId: 'mara', role: 'identity', purpose: 'Her face.' }], panels: [{ panelId: '', description: 'Mara in the doorway.' }] }] }]);
  assert.deepEqual([sent.phrase, sent.summary], ['Saving the storyboard…', 'Saved Storyboard · Version 1']);
  // Order is array order; kept ids, set fields and a known delivery pass through.
  const kept = await call({ base: 'board-v1', shots: [shot({ shotId: 's2', framing: 'wide', dialogue: [{ character: 'Narrator', text: 'Late.', delivery: 'voice_over' }, { character: 'Mara', text: 'Here.', delivery: 'whisper' }] }), shot({ shotId: 's1', panels: [{ panelId: 'p1', description: 'A' }, { panelId: '', description: 'B' }] })] }, { kind: 'saved', versionId: 'board-v2', revision: 2 });
  assert.deepEqual(kept.received[0]!.baseVersionId, 'board-v1');
  assert.deepEqual(kept.received[0]!.shots.map(item => [item.shotId, item.framing, item.dialogue, item.panels.map(panel => panel.panelId)]), [
    ['s2', 'wide', [{ character: 'Narrator', text: 'Late.', delivery: 'voice_over' }, { character: 'Mara', text: 'Here.' }], ['']],
    ['s1', undefined, undefined, ['p1', '']],
  ]);
  assert.equal(kept.summary, 'Saved Storyboard · Version 2');
});

test('no input is nullable, and the schema bounds Shots and panels', async () => {
  assert.ok(!JSON.stringify(z.toJSONSchema(tool.inputSchema)).includes('"null"'));
  // A Shot's length is required, in whole seconds from 4 to 15.
  for (const durationS of [4, 15]) assert.deepEqual((await call({ shots: [shot({ durationS })] })).received[0]?.shots[0]?.durationS, durationS);
  const unlengthed = { intent: 'Mara arrives.', panels: [{ description: 'Mara in the doorway.' }] };
  for (const args of [{ shots: [unlengthed] }, ...[3, 16, 6.5].map(durationS => ({ shots: [shot({ durationS })] })), { shots: [] }, { shots: [shot({ panels: [] })] }, { shots: [shot({ panels: [1, 2, 3].map(n => ({ description: `P${n}` })) })] }, { shots: [shot({ references: [{ subjectId: 'mara', role: 'lighting', purpose: 'x' }] })] }, { shots: [shot({ intent: ' ' })] }]) {
    assert.equal((await call(args)).parsed, false, JSON.stringify(args));
  }
  const refused = projectToolActivity(productionTools, { toolCallId: 'c', toolName: 'save-storyboard', state: 'done', input: {}, output: { error: true } });
  assert.equal(refused?.summary, 'Not saved: the storyboard wasn’t valid');
});

test('every refusal has its line and a message the model can follow, with the field at fault', async () => {
  const cases: [AssistantStoryboardOutcome, string, RegExp][] = [
    [{ kind: 'no_script' }, 'Not saved: there is no script yet', /update-script first/],
    [{ kind: 'stale' }, 'Not saved: the storyboard changed since you read it', /redo the change on the current storyboard/],
    [{ kind: 'not_found' }, 'Not saved: that storyboard wasn’t found', /base is not this video's storyboard/],
    [{ kind: 'not_in_script', field: 'shots[0].references[0].subjectId' }, 'Not saved: a subject isn’t in the script; add it first', /^Not saved: shots\[0\]\.references\[0\]\.subjectId is not a subject the script lists/],
    [{ kind: 'role', field: 'shots[1].references[0].role' }, 'Not saved: a subject’s role doesn’t match its kind', /^Not saved: shots\[1\]\.references\[0\]\.role doesn't fit/],
    [{ kind: 'invalid', field: 'shots[0].panels[0].panelId' }, 'Not saved: the storyboard wasn’t valid', /^Not saved: shots\[0\]\.panels\[0\]\.panelId is not valid/],
    [{ kind: 'no_room' }, 'Not saved: this video has too many saved items', /do not retry/],
    [{ kind: 'unavailable' }, 'Not saved: saved work is unavailable', /do not retry in this turn/],
  ];
  for (const [outcome, line, message] of cases) {
    const sent = await call({ shots: [shot()] }, outcome);
    assert.ok(sent.parsed);
    assert.equal(sent.result.saved, false);
    assert.equal(sent.summary, line);
    assert.ok(line.length <= 60, line);
    assert.match(sent.result.message!, message);
    assert.equal(sent.result.field, 'field' in outcome ? outcome.field : undefined);
  }
});
