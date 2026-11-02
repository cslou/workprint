/**
 * Saved generation jobs: one row per paid provider task in `generation.requests`, written before the paid
 * call. This module owns that SQL and calls no peer domain; `application` checks conversation ownership.
 * Every transition names the states it may leave, and the table's trigger refuses any other move.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type JobStatus = 'submitting' | 'running' | 'interrupted' | 'succeeded' | 'failed';
export type JobFailure = 'invalid_input' | 'provider_error' | 'outcome_unknown' | 'expired' | 'check_refused';
export type VideoJob = Readonly<{
  id: string; accountId: string; conversationId: string; purpose: 'video';
  /** Exact saved image versions sent as frames, in order. */
  inputs: readonly string[];
  status: JobStatus; taskId?: string; failureReason?: JobFailure; resultVersionId?: string;
  submittedAt: Date; revision: number;
}>;
export type JobPage = Readonly<{ jobs: readonly VideoJob[]; nextCursor: string | null }>;
export type GenerationJobErrorCode = 'not_found' | 'stale' | 'invalid_input';

export class GenerationJobError extends Error {
  override readonly name = 'GenerationJobError';
  constructor(readonly code: GenerationJobErrorCode) { super(`Generation job ${code.replace('_', ' ')}`); }
}

/** MiniMax keeps a task queryable for 7 days from submission; after that a waiting job can only be expired. */
export const jobLifetimeDays = 7;

type Row = {
  request_id: string; owner_id: string; conversation_id: string; purpose: 'video'; inputs: string[]; status: JobStatus;
  task_id: string | null; failure_reason: JobFailure | null; result_version_id: string | null; submitted_at: Date; revision: number;
};
const columns = 'request_id,owner_id,conversation_id,purpose,inputs,status,task_id,failure_reason,result_version_id,submitted_at,revision';
const id = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 200;
const expired = `status IN ('running','interrupted') AND submitted_at < clock_timestamp() - interval '${jobLifetimeDays} days'`;

function job(row: Row): VideoJob {
  return Object.freeze({
    id: row.request_id, accountId: row.owner_id, conversationId: row.conversation_id, purpose: row.purpose, inputs: Object.freeze([...row.inputs]),
    status: row.status, ...(row.task_id ? { taskId: row.task_id } : {}), ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
    ...(row.result_version_id ? { resultVersionId: row.result_version_id } : {}), submittedAt: row.submitted_at, revision: row.revision,
  });
}

/** The reasons each state may fail with, matching the table's trigger. */
const failsFrom: Readonly<Record<JobFailure, readonly JobStatus[]>> = {
  invalid_input: ['submitting'], outcome_unknown: ['submitting'], provider_error: ['submitting', 'running'],
  check_refused: ['running'], expired: ['running', 'interrupted'],
};

export function createGenerationJobs(pool: Pool) {
  /** Moves a job past its expiry first, so no read or resume ever acts on a task MiniMax no longer keeps. */
  const expire = (account: string, where: 'request_id' | 'conversation_id', value: string) => pool.query(
    `UPDATE generation.requests SET status='failed',failure_reason='expired',revision=revision+1,updated_at=clock_timestamp()
     WHERE owner_id=$1 AND ${where}=$2 AND ${expired}`, [account, value]);

  async function move(account: string, request: string, from: readonly JobStatus[], to: { status: JobStatus; taskId?: string; failureReason?: JobFailure; resultVersionId?: string }, client: Pool | PoolClient = pool): Promise<VideoJob> {
    if (!id(account) || !id(request)) throw new GenerationJobError('not_found');
    const moved = await client.query<Row>(
      `UPDATE generation.requests SET status=$3,task_id=COALESCE($4,task_id),failure_reason=$5,result_version_id=$6,revision=revision+1,updated_at=clock_timestamp()
       WHERE owner_id=$1 AND request_id=$2 AND status=ANY($7::text[]) RETURNING ${columns}`,
      [account, request, to.status, to.taskId ?? null, to.failureReason ?? null, to.resultVersionId ?? null, from]);
    if (moved.rows[0]) return job(moved.rows[0]);
    const exists = await client.query('SELECT 1 FROM generation.requests WHERE owner_id=$1 AND request_id=$2', [account, request]);
    throw new GenerationJobError(exists.rowCount ? 'stale' : 'not_found');
  }

  return Object.freeze({
    /** Saves a job as `submitting` before its paid create is sent. Only the prompt's digest is kept. */
    async begin(account: string, conversation: string, input: { readonly prompt: string; readonly inputs: readonly string[] }): Promise<VideoJob> {
      if (!id(account) || !id(conversation) || typeof input.prompt !== 'string' || !input.prompt) throw new GenerationJobError('invalid_input');
      if (input.inputs.length > 2 || !input.inputs.every(id) || new Set(input.inputs).size !== input.inputs.length) throw new GenerationJobError('invalid_input');
      const digest = createHash('sha256').update(input.prompt).digest('hex');
      const saved = await pool.query<Row>(
        `INSERT INTO generation.requests(owner_id,request_id,conversation_id,purpose,prompt_sha256,inputs,status) VALUES($1,$2,$3,'video',$4,$5,'submitting') RETURNING ${columns}`,
        [account, randomUUID(), conversation, digest, [...input.inputs]]);
      return job(saved.rows[0]!);
    },
    /** MiniMax accepted the create: the job now waits on its task. */
    started: (account: string, request: string, taskId: string) => {
      if (!id(taskId)) throw new GenerationJobError('invalid_input');
      return move(account, request, ['submitting'], { status: 'running', taskId });
    },
    failed: (account: string, request: string, reason: JobFailure) => move(account, request, failsFrom[reason], { status: 'failed', failureReason: reason }),
    /** Stop, a deadline or a restart ended the wait; the task id is kept for a resume. */
    interrupted: (account: string, request: string) => move(account, request, ['running'], { status: 'interrupted' }),
    /** Waits on the same task again. An expired job is failed first, so it can't be resumed. */
    async resumed(account: string, request: string): Promise<VideoJob> {
      if (id(account) && id(request)) await expire(account, 'request_id', request);
      return move(account, request, ['interrupted'], { status: 'running' });
    },
    /** The clip was saved: called inside the transaction that saves it, so both commit or neither does. */
    succeeded: (client: PoolClient, account: string, request: string, resultVersionId: string) => {
      if (!id(resultVersionId)) throw new GenerationJobError('invalid_input');
      return move(account, request, ['running'], { status: 'succeeded', resultVersionId }, client);
    },
    async get(account: string, request: string): Promise<VideoJob> {
      if (!id(account) || !id(request)) throw new GenerationJobError('not_found');
      await expire(account, 'request_id', request);
      const found = await pool.query<Row>(`SELECT ${columns} FROM generation.requests WHERE owner_id=$1 AND request_id=$2`, [account, request]);
      if (!found.rows[0]) throw new GenerationJobError('not_found');
      return job(found.rows[0]);
    },
    /** The conversation's jobs, newest first. The cursor is the last job's id. */
    async list(account: string, conversation: string, options: { readonly cursor?: string | undefined; readonly limit: number; readonly status?: JobStatus | undefined }): Promise<JobPage> {
      if (!id(account) || !id(conversation)) throw new GenerationJobError('not_found');
      if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new GenerationJobError('invalid_input');
      if (options.cursor !== undefined && !(id(options.cursor) && /^[A-Za-z0-9_.-]+$/.test(options.cursor))) throw new GenerationJobError('invalid_input');
      await expire(account, 'conversation_id', conversation);
      if (options.cursor !== undefined) {
        const anchor = await pool.query('SELECT 1 FROM generation.requests WHERE owner_id=$1 AND conversation_id=$2 AND request_id=$3', [account, conversation, options.cursor]);
        if (!anchor.rowCount) throw new GenerationJobError('invalid_input');
      }
      const rows = (await pool.query<Row>(
        `SELECT ${columns} FROM generation.requests r WHERE owner_id=$1 AND conversation_id=$2 AND ($3::text IS NULL OR status=$3)
         AND ($4::text IS NULL OR (submitted_at,request_id) < (SELECT submitted_at,request_id FROM generation.requests WHERE owner_id=$1 AND request_id=$4))
         ORDER BY submitted_at DESC,request_id DESC LIMIT $5`,
        [account, conversation, options.status ?? null, options.cursor ?? null, options.limit + 1])).rows;
      const jobs = rows.slice(0, options.limit).map(job);
      return { jobs, nextCursor: rows.length > options.limit ? jobs.at(-1)!.id : null };
    },
  });
}
export type GenerationJobs = ReturnType<typeof createGenerationJobs>;
