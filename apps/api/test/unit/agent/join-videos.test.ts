import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { productionTools, projectToolActivity, type AgentCollaborators, type ToolContext } from '../../../src/agent/index.js';
import type { JoinOutcome } from '../../../src/application/index.js';
import { unusedSheets } from '../../support/unused-sheets.js';

const tool = productionTools.find(candidate => candidate.id === 'join-videos')!;
const scope = { accountId: randomUUID(), videoId: randomUUID() };
const [a, b] = [randomUUID(), randomUUID()];

/** Fake collaborators: each join answers `outcome`, and the calls are recorded. */
function harness(outcome: JoinOutcome | ((signal?: AbortSignal) => JoinOutcome), withJoins = true) {
  const calls: string[][] = [];
  const collaborators: AgentCollaborators = {
    readWorkspace: async () => ({ kind: 'unavailable' }),
    saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }), sheets: unusedSheets,
    readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }),
    ...(withJoins ? { joins: async (_account: string, _video: string, clips: readonly string[], signal?: AbortSignal) => { calls.push([...clips]); return typeof outcome === 'function' ? outcome(signal) : outcome; } } : {}),
  };
  return { collaborators, calls };
}
type Result = { made: boolean; reason?: string; message?: string; clips?: number; video?: { versionId: string; durationS: number } };
const run = (collaborators: AgentCollaborators, input: Record<string, unknown>, signal = new AbortController().signal) =>
  tool.execute(input, { scope, collaborators, signal, abortReason: () => signal.aborted ? 'stop' : undefined } satisfies ToolContext) as Promise<Result>;
const activity = (output: unknown) => projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'join-videos', state: 'done', input: {}, output });

test('the input takes 2 to 20 clips, and the tool says what it joins', () => {
  assert.equal(tool.phrase, 'Joining clips…');
  assert.ok(!tool.inputSchema.safeParse({ clips: [a] }).success);
  assert.ok(!tool.inputSchema.safeParse({ clips: Array.from({ length: 21 }, () => a) }).success);
  assert.deepEqual(tool.inputSchema.parse({ clips: [a, b] }), { clips: [a, b], showInChat: false });
  for (const rule of [/in the order given/, /original clips .* stay/, /same size, frame rate and encoding/, /at most 120 s/, /no paid call/, /chosen video, else its latest/, /state is Ready is that Shot's chosen video/, /showInChat/]) assert.match(tool.description, rule);
});

test('a join reports the new clip, and shows it only when asked', async () => {
  const outcome: JoinOutcome = { kind: 'joined', versionId: 'joined', width: 1344, height: 768, durationMs: 8083, clips: 2 };
  const { collaborators, calls } = harness(outcome);
  const result = await run(collaborators, { clips: [` ${a}`, b], showInChat: true });
  assert.deepEqual(calls, [[a, b]]);
  assert.deepEqual([result.made, result.clips, result.video], [true, 2, { versionId: 'joined', width: 1344, height: 768, durationS: 8.1 }]);
  assert.equal(activity(result)?.summary, 'Joined 2 clips');
  assert.deepEqual(tool.shownMedia!(result), [{ kind: 'video', versionId: 'joined' }]);
  assert.deepEqual(tool.shownMedia!(await run(collaborators, { clips: [a, b] })), []);
});

test('every refusal says nothing was saved, with its own done line', async () => {
  const cases: [JoinOutcome, string, RegExp][] = [
    [{ kind: 'invalid' }, 'Not joined: the request wasn’t valid', /2 to 20 clips/],
    [{ kind: 'not_found' }, 'Couldn’t join those clips', /read-workspace/],
    [{ kind: 'repeated' }, 'Not joined: a clip was named twice', /more than once/],
    [{ kind: 'too_long', lengthMs: 130_000 }, 'Not joined: the clips run over 120 s', /130 s, over the 120 s limit/],
    [{ kind: 'too_large' }, 'Not joined: the clips are too large', /over 100 MB, more than one join can take/],
    [{ kind: 'incompatible', clip: 2, difference: '672×384; clip 1 is 1344×768' }, 'Not joined: the clips don’t match', /clip 2 can't be joined to clip 1 \(672×384; clip 1 is 1344×768\)/],
    [{ kind: 'no_room' }, 'Not joined: this video has too many saved items', /too many saved items/],
    [{ kind: 'unavailable' }, 'Not joined: joining is unavailable', /could not be joined right now/],
  ];
  for (const [outcome, summary, message] of cases) {
    const result = await run(harness(outcome).collaborators, { clips: [a, b], showInChat: true });
    assert.equal(result.made, false);
    assert.match(result.message!, message);
    assert.match(result.message!, /Nothing was saved\./);
    assert.equal(activity(result)?.summary, summary);
    assert.deepEqual(tool.shownMedia!(result), []);
  }
  // Without joins composed, nothing is called.
  const { collaborators, calls } = harness({ kind: 'unavailable' }, false);
  const result = await run(collaborators, { clips: [a, b] });
  assert.equal(activity(result)?.summary, 'Not joined: videos can’t be joined on this server');
  assert.deepEqual(calls, []);
});

test('Stop ends the call', async () => {
  const controller = new AbortController();
  const { collaborators } = harness(() => { controller.abort(); return { kind: 'stopped' }; });
  await assert.rejects(run(collaborators, { clips: [a, b] }, controller.signal), (error: unknown) => error instanceof Error && error.name === 'AbortError');
});
