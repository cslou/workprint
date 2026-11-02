/**
 * Server-only client for MiniMax Video Generation V2 (`MiniMax-H3`, 768P): create a task, query it,
 * and download its clip. It maps failures to a closed set of codes, and says when a create may have
 * reached MiniMax. Errors never carry the key, the prompt, a frame or a result URL; result URLs are
 * time-limited credentials and are returned only to the caller.
 */

import { abortableDelay, readBounded } from './http.js';
import { createSafeDownload, DownloadError, type SafeDownload } from './safe-download.js';

export const miniMaxVideoBaseUrl = 'https://api.minimax.io';
export const miniMaxVideoModel = 'MiniMax-H3';
export const miniMaxVideoResolution = '768P';
export const videoRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
export type VideoRatio = (typeof videoRatios)[number];
export const videoDurations = { min: 4, max: 15 } as const;
/** The largest clip worth downloading. */
export const maxVideoDownloadBytes = 100 * 1024 * 1024;
const maxPromptCharacters = 7000;
const maxFrameBytes = 30 * 1024 * 1024;
const maxRequestBytes = 64 * 1024 * 1024;
const maxResponseBytes = 1024 * 1024;

/** A saved image sent as a frame: a data URL plus its saved size, which MiniMax limits. */
export interface VideoFrame { readonly dataUrl: string; readonly width: number; readonly height: number }
export interface VideoRequest {
  readonly prompt: string;
  /** Whole seconds, 4–15. */
  readonly durationS: number;
  /** Needed without frames; with frames MiniMax derives the shape (`adaptive`). */
  readonly ratio?: VideoRatio;
  readonly firstFrame?: VideoFrame;
  /** Only with a first frame: last-frame-only input is not verified. */
  readonly lastFrame?: VideoFrame;
}
export type VideoTask =
  | { readonly status: 'queued' | 'running' | 'cancelled' }
  | { readonly status: 'succeeded'; readonly result: { readonly url: string; readonly durationS?: number; readonly resolution?: string } }
  | { readonly status: 'failed'; readonly failure: { readonly code?: string } };

export type MiniMaxVideoErrorCode = 'invalid_request' | 'unauthorized' | 'payment_required' | 'rate_limited' | 'unavailable' | 'failed' | 'aborted';
const messages: Record<MiniMaxVideoErrorCode, string> = {
  invalid_request: 'MiniMax did not accept the video request',
  unauthorized: 'MiniMax refused the server key',
  payment_required: 'MiniMax refused the request for payment',
  rate_limited: 'MiniMax is limiting requests',
  unavailable: 'MiniMax video generation is unavailable',
  failed: 'MiniMax video generation failed',
  aborted: 'The video request was stopped',
};
export class MiniMaxVideoError extends Error {
  override readonly name = 'MiniMaxVideoError';
  /** MiniMax's numeric status code, the request field a local check refused, or `download`. */
  readonly detail: string | undefined;
  /** True when a create may have reached MiniMax, so it must never be sent again. */
  readonly outcomeUnknown: boolean;
  constructor(readonly code: MiniMaxVideoErrorCode, options: { detail?: string | undefined; outcomeUnknown?: boolean } = {}) {
    super(options.detail ? `${messages[code]} (${options.detail})` : messages[code]);
    this.detail = options.detail;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
  }
}

export interface MiniMaxVideoClient {
  submit(request: VideoRequest, signal?: AbortSignal): Promise<{ readonly taskId: string }>;
  query(taskId: string, signal?: AbortSignal): Promise<VideoTask>;
  /** At most `maxBytes` (and never over 100 MiB), sending no credentials. */
  download(url: string, signal?: AbortSignal, maxBytes?: number): Promise<Uint8Array>;
}
export interface MiniMaxVideoClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  /** Create timeout; 20 s by default. A create that times out has an unknown outcome. */
  readonly submitTimeoutMs?: number;
  /** Query timeout; 30 s by default. */
  readonly queryTimeoutMs?: number;
  /** Wait before the one retry of a 429; 2 s by default. */
  readonly retryDelayMs?: number;
  readonly fetch?: typeof fetch;
  /** The result download; production's public-HTTPS download by default. Tests pass a loopback one. */
  readonly download?: SafeDownload;
}

const invalid = (detail: string): never => { throw new MiniMaxVideoError('invalid_request', { detail }); };
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const token = (value: unknown, pattern: RegExp) => typeof value === 'string' && pattern.test(value) ? value : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
const taskIdPattern = /^[A-Za-z0-9_-]{1,200}$/;
/** Statuses that mean MiniMax took nothing; any other answer to a create leaves its outcome unknown. */
const refusals = new Set([400, 401, 402, 403, 422, 429]);

function checkFrame(frame: unknown, name: string): VideoFrame {
  const item = record(frame);
  const dataUrl = item?.dataUrl, width = item?.width, height = item?.height;
  const data = typeof dataUrl === 'string' ? /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)?.[1] : undefined;
  if (typeof dataUrl !== 'string' || data === undefined) return invalid(name);
  if (Math.floor(data.length * 3 / 4) > maxFrameBytes) invalid(`${name}.size`);
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height)
    || Math.min(width, height) < 256 || Math.max(width, height) > 5760) return invalid(`${name}.dimensions`);
  if (width / height < 0.4 || width / height > 2.5) invalid(`${name}.ratio`);
  return { dataUrl, width, height };
}

/** Checks the request against MiniMax's documented limits and builds MiniMax's body. */
function requestBody(request: VideoRequest): string {
  if (typeof request.prompt !== 'string' || !request.prompt.trim()) invalid('prompt');
  if (request.prompt.trim().length > maxPromptCharacters) invalid('prompt.length');
  if (!Number.isInteger(request.durationS) || request.durationS < videoDurations.min || request.durationS > videoDurations.max) invalid('durationS');
  if (request.lastFrame !== undefined && request.firstFrame === undefined) invalid('lastFrame');
  const frames: VideoFrame[] = [];
  if (request.firstFrame !== undefined) frames.push(checkFrame(request.firstFrame, 'firstFrame'));
  if (request.lastFrame !== undefined) frames.push(checkFrame(request.lastFrame, 'lastFrame'));
  if (!frames.length && !videoRatios.includes(request.ratio as VideoRatio)) invalid('ratio');
  const body = JSON.stringify({
    model: miniMaxVideoModel,
    content: [{ type: 'text', text: request.prompt.trim() },
      ...frames.map((frame, index) => ({ type: 'image_url', image_url: { url: frame.dataUrl }, role: index === 0 ? 'first_frame' : 'last_frame' }))],
    resolution: miniMaxVideoResolution, duration: request.durationS, ratio: frames.length ? 'adaptive' : request.ratio,
  });
  if (Buffer.byteLength(body) > maxRequestBytes) invalid('size');
  return body;
}

/** Checks a request against MiniMax's documented limits without sending anything; throws `invalid_request`. */
export function validateVideoRequest(request: VideoRequest): void { requestBody(request); }

/** Maps an error status. MiniMax's message is never copied; only its trailing `(code)` is kept. */
function failure(status: number, text: string, create: boolean): MiniMaxVideoError {
  let message: unknown;
  try { message = record(record(JSON.parse(text))?.error)?.message; } catch { message = undefined; }
  const detail = typeof message === 'string' ? /\((\d{1,10})\)\s*$/.exec(message)?.[1] : undefined;
  if (status === 400 || status === 422) return new MiniMaxVideoError('invalid_request', { detail });
  if (status === 401 || status === 403) return new MiniMaxVideoError('unauthorized', { detail });
  if (status === 402) return new MiniMaxVideoError('payment_required', { detail });
  if (status === 429) return new MiniMaxVideoError('rate_limited', { detail });
  return new MiniMaxVideoError(status >= 500 ? 'unavailable' : 'failed', { detail, outcomeUnknown: create });
}

const downloadCodes: Record<DownloadError['reason'], MiniMaxVideoErrorCode> = { refused: 'failed', too_large: 'failed', unavailable: 'unavailable', aborted: 'aborted' };

export function createMiniMaxVideoClient(options: MiniMaxVideoClientOptions): MiniMaxVideoClient {
  const send = options.fetch ?? fetch;
  const download = options.download ?? createSafeDownload();
  const submitTimeoutMs = options.submitTimeoutMs ?? 20_000, queryTimeoutMs = options.queryTimeoutMs ?? 30_000;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  const base = options.baseUrl.replace(/\/+$/, '');

  async function attempt(path: string, body: string | undefined, timeoutMs: number, signal: AbortSignal | undefined, create: boolean) {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await send(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', ...(body !== undefined ? { body } : {}),
        headers: { authorization: `Bearer ${options.apiKey}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const bytes = await readBounded(response.body as AsyncIterable<Uint8Array> | null, Number(response.headers.get('content-length') ?? NaN), maxResponseBytes,
        () => new MiniMaxVideoError('failed', { outcomeUnknown: create && !refusals.has(response.status) }), () => response.body?.cancel());
      return { status: response.status, text: bytes.toString('utf8') };
    } catch (error) {
      if (error instanceof MiniMaxVideoError) throw error;
      // Once sent, a create may have landed however it ended.
      if (signal?.aborted) throw new MiniMaxVideoError('aborted', { outcomeUnknown: create });
      throw new MiniMaxVideoError('unavailable', { outcomeUnknown: create });
    }
  }

  async function call(path: string, body: string | undefined, timeoutMs: number, signal: AbortSignal | undefined, create: boolean) {
    if (signal?.aborted) throw new MiniMaxVideoError('aborted');
    let response = await attempt(path, body, timeoutMs, signal, create);
    // A 429 means MiniMax took nothing, so one retry is safe even for a create.
    if (response.status === 429) {
      await abortableDelay(retryDelayMs, signal);
      if (signal?.aborted) throw new MiniMaxVideoError('aborted');
      response = await attempt(path, body, timeoutMs, signal, create);
    }
    if (response.status !== 200) throw failure(response.status, response.text, create);
    try { return record(JSON.parse(response.text)); } catch { return undefined; }
  }

  return {
    async submit(request, signal) {
      const data = await call('/v2/video_generation', requestBody(request), submitTimeoutMs, signal, true);
      const taskId = token(data?.task_id, taskIdPattern);
      // A 200 without a usable task id may still have started a paid task.
      if (!taskId) throw new MiniMaxVideoError('failed', { outcomeUnknown: true });
      return { taskId };
    },
    async query(taskId, signal) {
      if (!taskIdPattern.test(taskId)) invalid('taskId');
      const data = await call(`/v2/query/video_generation/${encodeURIComponent(taskId)}`, undefined, queryTimeoutMs, signal, false);
      const task = record(data?.task);
      const status = task?.status;
      if (!task || (task.id !== undefined && String(task.id) !== taskId)) throw new MiniMaxVideoError('failed');
      if (status === 'queued' || status === 'running' || status === 'cancelled') return { status };
      if (status === 'failed') {
        const code = token(record(task.error)?.code, /^[A-Za-z0-9_-]{1,40}$/);
        return { status, failure: code ? { code } : {} };
      }
      const url = record(task.content)?.url;
      if (status !== 'succeeded' || typeof url !== 'string' || url.length > 8192) throw new MiniMaxVideoError('failed');
      const durationS = typeof task.duration === 'number' && Number.isFinite(task.duration) ? task.duration : undefined;
      const resolution = token(task.resolution, /^[A-Za-z0-9]{1,16}$/);
      return { status, result: { url, ...(durationS !== undefined ? { durationS } : {}), ...(resolution ? { resolution } : {}) } };
    },
    async download(url, signal, maxBytes = maxVideoDownloadBytes) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) invalid('maxBytes');
      try { return await download(url, signal, Math.min(maxBytes, maxVideoDownloadBytes)); } catch (error) {
        if (signal?.aborted) throw new MiniMaxVideoError('aborted');
        throw new MiniMaxVideoError(error instanceof DownloadError ? downloadCodes[error.reason] : 'unavailable', { detail: 'download' });
      }
    },
  };
}
