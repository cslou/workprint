import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { z } from 'zod';
import { productionTools, projectToolActivity, type AgentCollaborators, type ToolContext } from '../../../src/agent/index.js';
import type { NewVideo, VideoJobOutcome } from '../../../src/application/index.js';

const tool = productionTools.find(candidate => candidate.id === 'generate-video')!;
const scope = { accountId: randomUUID(), videoId: randomUUID() };
const jobId = randomUUID();

/** Fake collaborators: each run answers `outcome`, and the calls are recorded. */
function harness(outcome: VideoJobOutcome, withVideos = true) {
  const calls: { start: NewVideo[]; resume: string[] } = { start: [], resume: [] };
  const collaborators: AgentCollaborators = {
    readWorkspace: async () => ({ kind: 'unavailable' }),
    saveScript: async () => ({ kind: 'unavailable' }),
    readImageInputs: async () => ({ kind: 'not_found' }),
    saveGeneratedImage: async () => ({ kind: 'unavailable' }),
    ...(withVideos ? { videos: { start: async (_a: string, _v: string, input: NewVideo) => { calls.start.push(input); return outcome; }, resume: async (_a: string, _v: string, id: string) => { calls.resume.push(id); return outcome; } } } : {}),
  };
  return { collaborators, calls };
}
const run = (collaborators: AgentCollaborators, input: Record<string, unknown>, signal = new AbortController().signal) =>
  tool.execute(input, { scope, collaborators, signal, abortReason: () => signal.aborted ? 'shutdown' : undefined } satisfies ToolContext) as Promise<{ made: boolean; reason?: string; message?: string }>;
const summary = (output: unknown) => projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-video', state: 'done', input: {}, output })?.summary;

test('without video jobs the tool refuses before any call', async () => {
  const { collaborators, calls } = harness({ kind: 'unavailable', created: false }, false);
  const result = await run(collaborators, { prompt: 'A bench' });
  assert.equal(summary(result), 'Not made: videos can’t be saved on this server');
  assert.match(result.message!, /nothing was sent to MiniMax/);
  assert.deepEqual(calls, { start: [], resume: [] });
});

test('optional values are harmless: an empty resume is a new job, empty frames are none, and a resume ignores the rest', async () => {
  const { collaborators, calls } = harness({ kind: 'input_not_found' });
  await run(collaborators, { prompt: 'A bench', resume: '', firstFrame: '', lastFrame: ' ' });
  assert.deepEqual(calls.start, [{ prompt: 'A bench', durationS: 6, ratio: '16:9' }]);
  const nulled = await run(collaborators, { prompt: 'A bench', firstFrame: 'null' });
  assert.deepEqual(calls.start.at(-1), { prompt: 'A bench', durationS: 6, ratio: '16:9', firstFrame: 'null' });
  assert.equal(summary(nulled), 'Not made: an input image wasn’t found'); assert.match(nulled.message!, /Call read-workspace/);
  await run(collaborators, { resume: ` ${jobId} `, prompt: '', firstFrame: randomUUID(), durationS: 15 });
  assert.deepEqual(calls.resume, [jobId]); assert.equal(calls.start.length, 2);
  const empty = await run(collaborators, { prompt: '  ' });
  assert.equal(summary(empty), 'Not made: the request wasn’t valid'); assert.equal(calls.start.length, 2);
  // The model is offered no nullable field.
  assert.ok(!JSON.stringify(z.toJSONSchema(tool.inputSchema)).includes('"null"'));
});

test('each outcome has its own line and a message the model can follow', async () => {
  const cases: [VideoJobOutcome, string, RegExp][] = [
    [{ kind: 'interrupted', jobId }, 'Stopped waiting for the video', new RegExp(`resume set to "${jobId}"`)],
    [{ kind: 'failed', jobId, reason: 'outcome_unknown', provider: 'unavailable' }, 'Not made: MiniMax’s answer was lost', /cannot be resumed and was not sent again/],
    [{ kind: 'failed', jobId, reason: 'invalid_input', provider: 'invalid_request' }, 'Not made: MiniMax refused the request', /Rephrase the prompt/],
    [{ kind: 'failed', jobId, reason: 'provider_error', provider: 'unauthorized' }, 'Not made: MiniMax refused the server key', /do not retry/],
    [{ kind: 'failed', jobId, reason: 'provider_error', provider: 'payment_required' }, 'Not made: MiniMax asked for payment', /payment/],
    [{ kind: 'failed', jobId, reason: 'provider_error', provider: 'rate_limited' }, 'Not made: MiniMax is busy', /ask again later/],
    [{ kind: 'failed', jobId, reason: 'provider_error', provider: 'unavailable' }, 'Not made: MiniMax is unavailable', /do not retry in this turn/],
    [{ kind: 'failed', jobId, reason: 'provider_error', provider: 'task_failed' }, 'Not made: MiniMax couldn’t make the video', /failed to make/],
    [{ kind: 'failed', jobId, reason: 'provider_error', provider: 'task_cancelled' }, 'Not made: MiniMax cancelled the video', /cancelled/],
    [{ kind: 'failed', jobId, reason: 'check_refused' }, 'Not saved: the video didn’t pass checks', /media checks/],
    [{ kind: 'invalid', detail: 'firstFrame.dimensions' }, 'Not made: the request wasn’t valid', /\(firstFrame\.dimensions\)\. Nothing was sent/],
    [{ kind: 'not_found' }, 'Couldn’t find that video job', /Leave resume empty/],
    [{ kind: 'busy', jobId }, 'That video is still being made', /do not start it again/],
    [{ kind: 'already_saved', jobId, versionId: randomUUID() }, 'That video is already saved', /already saved\. Do not resume/],
    [{ kind: 'not_resumable', jobId, reason: 'expired' }, 'That video failed and can’t be resumed', /cannot be resumed/],
    [{ kind: 'unavailable', created: true }, 'Not saved: saved video jobs are unavailable', /MiniMax may have started it/],
    [{ kind: 'unavailable', created: false }, 'Not made: saved work is unavailable', /nothing was sent to MiniMax/],
  ];
  for (const [outcome, line, message] of cases) {
    const result = await run(harness(outcome).collaborators, { prompt: 'A bench' });
    assert.equal(summary(result), line, outcome.kind); assert.match(result.message!, message, line);
  }
  assert.equal(summary({ error: true }), 'Not made: the request wasn’t valid');
});

test('a shutdown, or a signal that fired before the create, ends the call incomplete instead of returning a line', async () => {
  const controller = new AbortController();
  controller.abort(new Error('Server shutting down'));
  for (const outcome of [{ kind: 'shutdown', jobId }, { kind: 'not_started' }] as const) {
    await assert.rejects(run(harness(outcome).collaborators, { prompt: 'A bench' }, controller.signal), /Server shutting down/);
  }
});
