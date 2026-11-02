import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createVideoJobs, type GeneratedVideoOutcome, type ImageInputsOutcome, type VideoAbortReason } from '../../../src/application/index.js';
import { GenerationJobError, MiniMaxVideoError, type JobFailure, type JobStatus, type VideoJob, type VideoTask } from '../../../src/generation/index.js';

const account = randomUUID(), video = randomUUID();
const frame = (width = 320, height = 256) => ({ versionId: randomUUID(), dataUrl: 'data:image/png;base64,iVBORw0KGgo=', width, height });

/** In-memory jobs with the table's moves; each move refuses a state it may not leave. */
function memoryJobs() {
  const rows = new Map<string, VideoJob>();
  const move = (id: string, from: JobStatus[], to: Partial<VideoJob>) => {
    const row = rows.get(id);
    if (!row) throw new GenerationJobError('not_found');
    if (!from.includes(row.status)) throw new GenerationJobError('stale');
    const next = { ...row, ...to, revision: row.revision + 1 };
    rows.set(id, next);
    return next;
  };
  return {
    rows,
    begin: async (accountId: string, conversationId: string, input: { prompt: string; inputs: readonly string[] }) => {
      const job: VideoJob = { id: randomUUID(), accountId, conversationId, purpose: 'video', inputs: [...input.inputs], status: 'submitting', submittedAt: new Date(), revision: 1 };
      rows.set(job.id, job);
      return job;
    },
    started: async (_: string, id: string, taskId: string) => move(id, ['submitting'], { status: 'running', taskId }),
    failed: async (_: string, id: string, reason: JobFailure) => move(id, ['submitting', 'running', 'interrupted'], { status: 'failed', failureReason: reason }),
    interrupted: async (_: string, id: string) => move(id, ['running'], { status: 'interrupted' }),
    resumed: async (_: string, id: string) => move(id, ['interrupted'], { status: 'running' }),
    get: async (_: string, id: string) => { const row = rows.get(id); if (!row) throw new GenerationJobError('not_found'); return row; },
  };
}

function harness(options: { frames?: ImageInputsOutcome; submit?: () => Promise<{ taskId: string }>; tasks?: (() => Promise<VideoTask>)[]; save?: GeneratedVideoOutcome['kind'] } = {}) {
  const jobs = memoryJobs(), calls = { submits: 0, queries: 0, downloads: 0, saves: 0 };
  const runner = createVideoJobs({
    jobs,
    client: {
      submit: async () => { calls.submits++; return options.submit ? options.submit() : { taskId: 'task-1' }; },
      query: async () => { const next = options.tasks?.[calls.queries++]; return next ? next() : { status: 'succeeded', result: { url: 'https://example.invalid/clip.mp4' } }; },
      download: async () => { calls.downloads++; return new Uint8Array([1]); },
    },
    readImageInputs: async () => options.frames ?? { kind: 'not_found' },
    saveVideo: async () => {
      calls.saves++;
      const kind = options.save ?? 'saved';
      return kind === 'saved' ? { kind, versionId: randomUUID(), width: 1344, height: 768, durationMs: 4042 } : { kind };
    },
    timing: { pollIntervalMs: 1, pollDeadlineMs: 2000 },
  });
  return { runner, jobs, calls };
}
const control = (controller = new AbortController(), reason: VideoAbortReason = 'stop') => ({ signal: controller.signal, abortReason: () => controller.signal.aborted ? reason : undefined });
const input = { prompt: 'A slow push-in', durationS: 6, ratio: '16:9' as const };

test('frames and the request are checked before any job is saved or sent', async () => {
  const lastOnly = harness({ frames: { kind: 'read', images: [frame()] } });
  assert.deepEqual(await lastOnly.runner.start(account, video, { ...input, lastFrame: randomUUID() }, control()), { kind: 'invalid', detail: 'lastFrame' });
  const small = harness({ frames: { kind: 'read', images: [frame(200, 200)] } });
  assert.deepEqual(await small.runner.start(account, video, { ...input, firstFrame: randomUUID() }, control()), { kind: 'invalid', detail: 'firstFrame.dimensions' });
  const missing = harness();
  assert.deepEqual(await missing.runner.start(account, video, { ...input, firstFrame: 'null' }, control()), { kind: 'input_not_found' });
  const same = harness(), id = randomUUID();
  assert.deepEqual(await same.runner.start(account, video, { ...input, firstFrame: id, lastFrame: id }, control()), { kind: 'invalid', detail: 'lastFrame' });
  for (const run of [lastOnly, small, missing, same]) { assert.equal(run.jobs.rows.size, 0); assert.equal(run.calls.submits, 0); }
});

test('a refused create fails its job by what MiniMax said, and an unknown outcome is never sent again', async () => {
  const cases: [MiniMaxVideoError, JobFailure, string][] = [
    [new MiniMaxVideoError('failed', { outcomeUnknown: true }), 'outcome_unknown', 'failed'],
    [new MiniMaxVideoError('invalid_request', { detail: '1026' }), 'invalid_input', 'invalid_request'],
    [new MiniMaxVideoError('payment_required'), 'provider_error', 'payment_required'],
    [new MiniMaxVideoError('rate_limited'), 'provider_error', 'rate_limited'],
  ];
  for (const [error, reason, provider] of cases) {
    const { runner, jobs, calls } = harness({ submit: async () => { throw error; } });
    const outcome = await runner.start(account, video, input, control());
    assert.ok(outcome.kind === 'failed'); assert.deepEqual([outcome.reason, outcome.provider], [reason, provider]);
    assert.deepEqual([...jobs.rows.values()].map(job => [job.status, job.failureReason]), [['failed', reason]]);
    assert.equal(calls.submits, 1);
  }
});

test('Stop during the create waits it out, so the interrupted job keeps its task id', async () => {
  const controller = new AbortController();
  const { runner, jobs, calls } = harness({ submit: async () => { controller.abort(); return { taskId: 'task-held' }; } });
  const outcome = await runner.start(account, video, input, control(controller));
  assert.equal(outcome.kind, 'interrupted');
  assert.deepEqual([...jobs.rows.values()].map(job => [job.status, job.taskId]), [['interrupted', 'task-held']]);
  assert.equal(calls.queries, 0);
});

test('a shutdown while polling leaves the job running; a refused clip fails it check_refused; a failed save leaves it resumable', async () => {
  const controller = new AbortController();
  const shutdown = harness({ tasks: [async () => { controller.abort(); return { status: 'running' }; }] });
  const stopped = await shutdown.runner.start(account, video, input, control(controller, 'shutdown'));
  assert.equal(stopped.kind, 'shutdown');
  assert.deepEqual([...shutdown.jobs.rows.values()].map(job => job.status), ['running']);
  const refused = harness({ save: 'refused' });
  assert.equal((await refused.runner.start(account, video, input, control())).kind, 'failed');
  assert.deepEqual([...refused.jobs.rows.values()].map(job => [job.status, job.failureReason]), [['failed', 'check_refused']]);
  const unsaved = harness({ save: 'unavailable' });
  assert.equal((await unsaved.runner.start(account, video, input, control())).kind, 'interrupted');
  const [job] = unsaved.jobs.rows.values();
  assert.equal(job!.status, 'interrupted');
  assert.equal((await unsaved.runner.resume(account, video, job!.id, control())).kind, 'interrupted');
  assert.equal(unsaved.calls.submits, 1);
});

test('a resume refuses every state but interrupted, and another video\'s job is not found', async () => {
  const { runner, jobs, calls } = harness();
  const job = await jobs.begin(account, video, { prompt: 'p', inputs: [] });
  assert.deepEqual(await runner.resume(account, video, job.id, control()), { kind: 'busy', jobId: job.id });
  assert.deepEqual(await runner.resume(account, randomUUID(), job.id, control()), { kind: 'not_found' });
  assert.deepEqual(await runner.resume(account, video, randomUUID(), control()), { kind: 'not_found' });
  await jobs.failed(account, job.id, 'outcome_unknown');
  assert.deepEqual(await runner.resume(account, video, job.id, control()), { kind: 'not_resumable', jobId: job.id, reason: 'outcome_unknown' });
  assert.equal(calls.submits + calls.queries, 0);
});
