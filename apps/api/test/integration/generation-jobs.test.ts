import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { operations } from '@workprint/contracts';
import { publishVersion } from '../../src/artifacts/publication.js';
import { unavailableApplication, withGenerationRequests } from '../../src/application/index.js';
import { transaction } from '../../src/db/index.js';
import { createGenerationJobs, GenerationJobError, type VideoJob } from '../../src/generation/index.js';
import { applyArtifactMigrations } from '../support/artifact-database.js';
import { testStack } from '../support/test-stack.js';

const owner = 'job-owner', other = 'job-other', conversation = 'conversation-a', foreignConversation = 'conversation-b';
const refused = (code: string) => (error: unknown) => error instanceof GenerationJobError && error.code === code;
const clip = (client: Parameters<typeof publishVersion>[0]) => publishVersion(client, { accountId: owner, conversationId: conversation, kind: 'video', createdBy: 'assistant', dependencies: [],
  media: { contentType: 'video/mp4', byteSize: 4096, width: 1344, height: 768, durationMs: 4000, hasAudio: true } });

/** A fresh migrated database and the serving pool over it. */
async function jobStore(t: { after(fn: () => Promise<unknown>): void }) {
  const db = await testStack().testDatabase();
  await applyArtifactMigrations(db.setupUrl);
  const pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  t.after(async () => { await pool.end(); await db.close(); });
  return { pool, jobs: createGenerationJobs(pool) };
}
/** A job saved as if submitted `days` ago, in `status`; seeded through the serving role's insert grant. */
async function seeded(pool: Pool, status: 'running' | 'interrupted' | 'submitting' | 'succeeded', days = 0, resultVersionId?: string) {
  const id = randomUUID();
  await pool.query(`INSERT INTO generation.requests(owner_id,request_id,conversation_id,purpose,prompt_sha256,status,task_id,result_version_id,submitted_at)
    VALUES($1,$2,$3,'video',repeat('a',64),$4,$5,$6,clock_timestamp() - make_interval(days => $7))`, [owner, id, conversation, status, status === 'submitting' ? null : `task-${id}`, resultVersionId ?? null, days]);
  return id;
}

test('saved video jobs move only along their closed transitions', { timeout: 120000 }, async t => {
  const { pool, jobs } = await jobStore(t);

  await t.test('a job is saved submitting, then runs, is interrupted, resumes and fails only as allowed', async () => {
    const job = await jobs.begin(owner, conversation, { prompt: 'A slow push-in', inputs: ['frame-v1'] });
    assert.deepEqual([job.status, job.inputs, job.taskId, job.revision], ['submitting', ['frame-v1'], undefined, 1]);
    const prompt = await pool.query('SELECT prompt_sha256 FROM generation.requests WHERE request_id=$1', [job.id]);
    assert.match(prompt.rows[0].prompt_sha256, /^[a-f0-9]{64}$/, 'only the prompt digest is kept');
    const running = await jobs.started(owner, job.id, '459000874041694');
    assert.deepEqual([running.status, running.taskId, running.revision], ['running', '459000874041694', 2]);
    assert.equal((await jobs.interrupted(owner, job.id)).status, 'interrupted');
    await assert.rejects(jobs.started(owner, job.id, 'another-task'), refused('stale'), 'an interrupted job is resumed, never re-created');
    assert.equal((await jobs.resumed(owner, job.id)).taskId, '459000874041694', 'a resume keeps the same task');
    const failed = await jobs.failed(owner, job.id, 'check_refused');
    assert.deepEqual([failed.status, failed.failureReason], ['failed', 'check_refused']);
    // A stale writer can't move a finished job, through the module or around it.
    await assert.rejects(jobs.interrupted(owner, job.id), refused('stale'));
    await assert.rejects(jobs.resumed(owner, job.id), refused('stale'));
    await assert.rejects(pool.query("UPDATE generation.requests SET status='running',failure_reason=NULL,revision=revision+1 WHERE request_id=$1", [job.id]), { code: '23514' });
    await assert.rejects(pool.query('DELETE FROM generation.requests WHERE request_id=$1', [job.id]), { code: '42501' });
  });

  await t.test('a certainly refused or unknown create fails the submitting job with its reason', async () => {
    for (const reason of ['invalid_input', 'provider_error', 'outcome_unknown'] as const) {
      const job = await jobs.begin(owner, conversation, { prompt: 'Refused', inputs: [] });
      assert.equal((await jobs.failed(owner, job.id, reason)).failureReason, reason);
    }
    const unsent = await jobs.begin(owner, conversation, { prompt: 'Not checked yet', inputs: [] });
    await assert.rejects(jobs.failed(owner, unsent.id, 'check_refused'), refused('stale'), 'nothing was made to check');
    await assert.rejects(jobs.interrupted(owner, unsent.id), refused('stale'), 'no job is interrupted without a task id');
  });

  await t.test('a foreign account or conversation reads not-found', async () => {
    const job = await jobs.begin(owner, conversation, { prompt: 'Mine', inputs: [] });
    await assert.rejects(jobs.get(other, job.id), refused('not_found'));
    await assert.rejects(jobs.started(other, job.id, 'task'), refused('not_found'));
    const owned = async (account: string, id: string) => ({ kind: account === owner && id === conversation ? 'owned' as const : 'not_found' as const });
    const application = withGenerationRequests({ operations: unavailableApplication }, owned, jobs);
    const as = (account: string) => async () => ({ kind: 'verified' as const, accountId: account });
    const listed = await application.operations.generationRequests({ params: { id: conversation }, query: {}, body: {} }, as(owner));
    const page = operations.generationRequests.response.parse(listed);
    assert.ok(page.items.some(item => item.id === job.id && item.purpose === 'video' && !('batchId' in item)));
    assert.equal((await application.operations.generationRequests({ params: { id: foreignConversation }, query: {}, body: {} }, as(owner))).error?.code, 'not_found');
    assert.equal((await application.operations.generationRequests({ params: { id: conversation }, query: {}, body: {} }, as(other))).error?.code, 'not_found');
    assert.equal((await application.operations.generationRequest({ params: { id: job.id }, query: {}, body: {} }, as(other))).error?.code, 'not_found');
    const one = await application.operations.generationRequest({ params: { id: job.id }, query: {}, body: {} }, as(owner));
    assert.deepEqual(one, { id: job.id, purpose: 'video', status: 'submitting', remote: {} });
  });

  await t.test('pages are newest first and bounded, and a cursor from elsewhere is refused', async () => {
    const all = await jobs.list(owner, conversation, { limit: 100 });
    const pages: VideoJob[] = [];
    let cursor: string | undefined;
    do { const page = await jobs.list(owner, conversation, { limit: 2, cursor }); pages.push(...page.jobs); cursor = page.nextCursor ?? undefined; } while (cursor);
    assert.deepEqual(pages.map(job => job.id), all.jobs.map(job => job.id));
    assert.ok(all.jobs.every((job, index) => index === 0 || all.jobs[index - 1]!.submittedAt >= job.submittedAt));
    await assert.rejects(jobs.list(other, conversation, { limit: 2, cursor: all.jobs[0]!.id }), refused('invalid_input'));
    assert.ok((await jobs.list(owner, conversation, { limit: 100, status: 'failed' })).jobs.every(job => job.status === 'failed'));
  });

  await t.test('a job waiting past 7 days is failed expired on read and resume, with no provider call', async () => {
    // This module has no network client at all: expiry is a database transition only.
    const stale = await seeded(pool, 'running', 8), parked = await seeded(pool, 'interrupted', 8), fresh = await seeded(pool, 'interrupted', 6);
    assert.deepEqual([(await jobs.get(owner, stale)).status, (await jobs.get(owner, stale)).failureReason], ['failed', 'expired']);
    await assert.rejects(jobs.resumed(owner, parked), refused('stale'));
    assert.equal((await jobs.get(owner, parked)).failureReason, 'expired');
    assert.equal((await jobs.resumed(owner, fresh)).status, 'running');
  });

  await t.test('success commits with the clip save: a failed save rolls both back, and a second success is refused', async () => {
    const job = await seeded(pool, 'running');
    let version = '';
    await assert.rejects(transaction(pool, async client => {
      version = (await clip(client)).id;
      await jobs.succeeded(client, owner, job, version);
      throw new Error('save failed after the clip was stored');
    }), /save failed/);
    assert.equal((await pool.query('SELECT 1 FROM artifacts.versions WHERE version_id=$1', [version])).rowCount, 0, 'no clip rows remain');
    assert.equal((await jobs.get(owner, job)).status, 'running', 'the job is still waiting');
    const saved = await transaction(pool, async client => { const made = await clip(client); return jobs.succeeded(client, owner, job, made.id); });
    assert.deepEqual([saved.status, typeof saved.resultVersionId], ['succeeded', 'string']);
    await assert.rejects(transaction(pool, async client => jobs.succeeded(client, owner, job, (await clip(client)).id)), refused('stale'));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM artifacts.versions WHERE owner_id=$1 AND kind='video'", [owner])).rows[0].n, 1, 'a resume never saves a second clip');
  });
});

test('the start pass interrupts running jobs and fails submitting ones, leaving finished jobs', { timeout: 120000 }, async t => {
  const { pool, jobs } = await jobStore(t);
  const version = await transaction(pool, client => clip(client));
  const running = await seeded(pool, 'running'), submitting = await seeded(pool, 'submitting'), succeeded = await seeded(pool, 'succeeded', 0, version.id);
  assert.deepEqual(await jobs.interruptWaiting(), { interrupted: 1, failed: 1 });
  const state = async (id: string) => { const job = await jobs.get(owner, id); return [job.status, job.failureReason, job.taskId !== undefined]; };
  assert.deepEqual(await state(running), ['interrupted', undefined, true]);
  assert.deepEqual(await state(submitting), ['failed', 'outcome_unknown', false]);
  assert.deepEqual(await state(succeeded), ['succeeded', undefined, true]);
  assert.deepEqual(await jobs.interruptWaiting(), { interrupted: 0, failed: 0 }, 'one pass; nothing is polled or resubmitted');
});
