/**
 * Server-only client for MiniMax Video Generation V2 (`MiniMax-H3`, 768P): create a task, query it,
 * and download its clip. It maps failures to a closed set of codes, and says when a create may have
 * reached MiniMax. Errors never carry the key, the prompt, a frame or a result URL; result URLs are
 * time-limited credentials and are returned only to the caller.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

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
const maxRedirects = 3;

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
  /** MiniMax's numeric status code, or the request field a local check refused. */
  readonly detail: string | undefined;
  /** True when a create may have reached MiniMax, so it must never be sent again. */
  readonly outcomeUnknown: boolean;
  constructor(readonly code: MiniMaxVideoErrorCode, options: { detail?: string | undefined; outcomeUnknown?: boolean } = {}) {
    super(options.detail ? `${messages[code]} (${options.detail})` : messages[code]);
    this.detail = options.detail;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
  }
}

/** Resolves a host name to its addresses. */
export type AddressLookup = (hostname: string) => Promise<readonly { readonly address: string; readonly family: number }[]>;
export interface MiniMaxVideoClient {
  submit(request: VideoRequest, signal?: AbortSignal): Promise<{ readonly taskId: string }>;
  query(taskId: string, signal?: AbortSignal): Promise<VideoTask>;
  /** Streams at most `maxBytes`, sending no credentials, re-checking every redirect. */
  download(url: string, signal?: AbortSignal, maxBytes?: number): Promise<Uint8Array>;
}
export interface MiniMaxVideoClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  /** Create timeout; 20 s by default. A create that times out has an unknown outcome. */
  readonly submitTimeoutMs?: number;
  /** Query timeout; 30 s by default. */
  readonly queryTimeoutMs?: number;
  /** Download timeout; 120 s by default. */
  readonly downloadTimeoutMs?: number;
  /** Wait before the one retry of a 429; 2 s by default. */
  readonly retryDelayMs?: number;
  readonly fetch?: typeof fetch;
  readonly lookup?: AddressLookup;
  /**
   * Test composition only: lets downloads reach plain-HTTP loopback hosts, such as the fake
   * MiniMax. Nothing in configuration or the environment sets it.
   */
  readonly allowLoopbackDownloads?: boolean;
}

const invalid = (detail: string): never => { throw new MiniMaxVideoError('invalid_request', { detail }); };
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const token = (value: unknown, pattern: RegExp, max: number) => typeof value === 'string' && value.length <= max && pattern.test(value) ? value : undefined;
const taskIdPattern = /^[A-Za-z0-9_-]{1,200}$/;

function checkFrame(frame: unknown, name: string): VideoFrame {
  const item = record(frame);
  const match = typeof item?.dataUrl === 'string' ? /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.dataUrl) : null;
  if (!item || !match) return invalid(name);
  if (Math.floor(match[2]!.length * 3 / 4) > maxFrameBytes) invalid(`${name}.size`);
  const { width, height } = item;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height)
    || Math.min(width, height) < 256 || Math.max(width, height) > 5760) invalid(`${name}.dimensions`);
  const ratio = (width as number) / (height as number);
  if (ratio < 0.4 || ratio > 2.5) invalid(`${name}.ratio`);
  return item as unknown as VideoFrame;
}

/** Checks a request against MiniMax's documented limits, without sending anything. Returns MiniMax's body. */
export function validateVideoRequest(request: VideoRequest): Record<string, unknown> {
  if (typeof request.prompt !== 'string' || !request.prompt.trim()) invalid('prompt');
  if (request.prompt.trim().length > maxPromptCharacters) invalid('prompt.length');
  if (!Number.isInteger(request.durationS) || request.durationS < videoDurations.min || request.durationS > videoDurations.max) invalid('durationS');
  if (request.lastFrame !== undefined && request.firstFrame === undefined) invalid('lastFrame');
  const frames = [request.firstFrame && checkFrame(request.firstFrame, 'firstFrame'), request.lastFrame && checkFrame(request.lastFrame, 'lastFrame')]
    .filter((frame): frame is VideoFrame => frame !== undefined);
  if (!frames.length && !videoRatios.includes(request.ratio as VideoRatio)) invalid('ratio');
  const body = {
    model: miniMaxVideoModel,
    content: [{ type: 'text', text: request.prompt.trim() },
      ...frames.map((frame, index) => ({ type: 'image_url', image_url: { url: frame.dataUrl }, role: index === 0 ? 'first_frame' : 'last_frame' }))],
    resolution: miniMaxVideoResolution, duration: request.durationS, ratio: frames.length ? 'adaptive' : request.ratio,
  };
  if (Buffer.byteLength(JSON.stringify(body)) > maxRequestBytes) invalid('size');
  return body;
}

/** The body as bytes, read only up to `limit`; a longer body is cancelled and fails. */
async function bounded(body: AsyncIterable<Uint8Array> | null, declared: number, limit: number, cancel: () => unknown, onOverflow: () => Error): Promise<Buffer> {
  if (Number.isFinite(declared) && declared > limit) { await cancel(); throw onOverflow(); }
  const chunks: Uint8Array[] = []; let size = 0;
  if (body) for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > limit) { await cancel(); throw onOverflow(); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

/** Maps an error status. MiniMax's message is never copied; only its trailing `(code)` is kept. */
function failure(status: number, text: string, outcomeUnknown: boolean): MiniMaxVideoError {
  let message: unknown;
  try { message = record(record(JSON.parse(text))?.error)?.message; } catch { message = undefined; }
  const detail = typeof message === 'string' ? /\((\d{1,10})\)\s*$/.exec(message)?.[1] : undefined;
  if (status === 400 || status === 422) return new MiniMaxVideoError('invalid_request', { detail });
  if (status === 401 || status === 403) return new MiniMaxVideoError('unauthorized', { detail });
  if (status === 402) return new MiniMaxVideoError('payment_required', { detail });
  if (status === 429) return new MiniMaxVideoError('rate_limited', { detail });
  return new MiniMaxVideoError(status >= 500 ? 'unavailable' : 'failed', { detail, outcomeUnknown });
}

function privateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
/** True for loopback, private, link-local, multicast and unparseable addresses. */
export function privateAddress(address: string) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(value);
  if (family === 4) return privateIpv4(value);
  if (family !== 6) return true;
  if (value.startsWith('::ffff:')) return privateIpv4(value.slice(7));
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89a-f]/.test(value) || value.startsWith('ff');
}
const loopback = (host: string) => ['127.0.0.1', '::1', 'localhost'].includes(host);
const defaultLookup: AddressLookup = async hostname => dnsLookup(hostname, { all: true, verbatim: true });

/** One GET to addresses already checked, pinned so a second DNS answer can't redirect it. */
function pinnedGet(url: URL, addresses: readonly { address: string; family: number }[], signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(url, {
      method: 'GET', signal, agent: false,
      lookup: (_host, options, callback) => {
        const family = typeof options === 'number' ? options : options?.family;
        const candidates = family ? addresses.filter(item => item.family === family) : addresses;
        if (!candidates.length) { callback(new Error('no checked address'), '', 4); return; }
        if (typeof options === 'object' && options?.all) (callback as unknown as (error: null, all: typeof candidates) => void)(null, candidates);
        else callback(null, candidates[0]!.address, candidates[0]!.family);
      },
    }, resolve);
    request.on('error', reject);
    request.end();
  });
}

export function createMiniMaxVideoClient(options: MiniMaxVideoClientOptions): MiniMaxVideoClient {
  const send = options.fetch ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  const submitTimeoutMs = options.submitTimeoutMs ?? 20_000, queryTimeoutMs = options.queryTimeoutMs ?? 30_000;
  const downloadTimeoutMs = options.downloadTimeoutMs ?? 120_000, retryDelayMs = options.retryDelayMs ?? 2000;
  const base = options.baseUrl.replace(/\/+$/, '');

  async function attempt(path: string, init: { method: string; body?: string }, timeoutMs: number, signal: AbortSignal | undefined, create: boolean) {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await send(`${base}${path}`, {
        method: init.method, redirect: 'error', ...(init.body !== undefined ? { body: init.body } : {}),
        headers: { authorization: `Bearer ${options.apiKey}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const body = response.body as AsyncIterable<Uint8Array> | null;
      const bytes = await bounded(body, Number(response.headers.get('content-length') ?? NaN), maxResponseBytes, () => response.body?.cancel(),
        () => new MiniMaxVideoError('failed', { outcomeUnknown: create && response.ok }));
      return { status: response.status, text: bytes.toString('utf8') };
    } catch (error) {
      if (error instanceof MiniMaxVideoError) throw error;
      if (signal?.aborted) throw new MiniMaxVideoError('aborted', { outcomeUnknown: create });
      throw new MiniMaxVideoError(timeout.aborted ? 'unavailable' : 'failed', { outcomeUnknown: create });
    }
  }

  async function call(path: string, init: { method: string; body?: string }, timeoutMs: number, signal: AbortSignal | undefined, create: boolean) {
    if (signal?.aborted) throw new MiniMaxVideoError('aborted');
    let response = await attempt(path, init, timeoutMs, signal, create);
    // A 429 means MiniMax took nothing, so one retry is safe even for a create.
    if (response.status === 429) {
      await new Promise<void>(resolve => {
        const stop = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, retryDelayMs);
        signal?.addEventListener('abort', stop, { once: true });
      });
      if (signal?.aborted) throw new MiniMaxVideoError('aborted');
      response = await attempt(path, init, timeoutMs, signal, create);
    }
    if (response.status !== 200) throw failure(response.status, response.text, create);
    try { return record(JSON.parse(response.text)); } catch { return undefined; }
  }

  async function checkedUrl(value: string): Promise<{ url: URL; addresses: readonly { address: string; family: number }[] }> {
    let url: URL;
    try { url = new URL(value); } catch { throw new MiniMaxVideoError('failed', { detail: 'download' }); }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const testLoopback = options.allowLoopbackDownloads === true && url.protocol === 'http:' && loopback(host);
    if ((url.protocol !== 'https:' && !testLoopback) || url.username || url.password) throw new MiniMaxVideoError('failed', { detail: 'download' });
    if (testLoopback) return { url, addresses: [{ address: host === '::1' ? '::1' : '127.0.0.1', family: host === '::1' ? 6 : 4 }] };
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new MiniMaxVideoError('failed', { detail: 'download' });
    let addresses: readonly { address: string; family: number }[];
    try { addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host); } catch { throw new MiniMaxVideoError('unavailable', { detail: 'download' }); }
    if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new MiniMaxVideoError('failed', { detail: 'download' });
    return { url, addresses };
  }

  return {
    async submit(request, signal) {
      const body = JSON.stringify(validateVideoRequest(request));
      const data = await call('/v2/video_generation', { method: 'POST', body }, submitTimeoutMs, signal, true);
      const taskId = token(data?.task_id, taskIdPattern, 200) ?? (typeof data?.task_id === 'number' && Number.isSafeInteger(data.task_id) ? String(data.task_id) : undefined);
      // A 200 without a usable task id may still have started a paid task.
      if (!taskId) throw new MiniMaxVideoError('failed', { outcomeUnknown: true });
      return { taskId };
    },
    async query(taskId, signal) {
      if (!taskIdPattern.test(taskId)) invalid('taskId');
      const data = await call(`/v2/query/video_generation/${encodeURIComponent(taskId)}`, { method: 'GET' }, queryTimeoutMs, signal, false);
      const task = record(data?.task);
      const status = task?.status;
      if (!task || (task.id !== undefined && String(task.id) !== taskId)) throw new MiniMaxVideoError('failed');
      if (status === 'queued' || status === 'running' || status === 'cancelled') return { status };
      if (status === 'failed') {
        const code = token(record(task.error)?.code, /^[A-Za-z0-9_-]{1,40}$/, 40) ?? (typeof record(task.error)?.code === 'number' ? String(record(task.error)!.code) : undefined);
        return { status, failure: code ? { code } : {} };
      }
      const url = record(task.content)?.url;
      if (status !== 'succeeded' || typeof url !== 'string' || url.length > 8192) throw new MiniMaxVideoError('failed');
      const durationS = typeof task.duration === 'number' && Number.isFinite(task.duration) ? task.duration : undefined;
      const resolution = token(task.resolution, /^[A-Za-z0-9]{1,16}$/, 16);
      return { status, result: { url, ...(durationS !== undefined ? { durationS } : {}), ...(resolution ? { resolution } : {}) } };
    },
    async download(value, signal, maxBytes = maxVideoDownloadBytes) {
      if (signal?.aborted) throw new MiniMaxVideoError('aborted');
      const timeout = AbortSignal.timeout(downloadTimeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let current = value;
      try {
        for (let hop = 0; ; hop++) {
          const { url, addresses } = await checkedUrl(current);
          const response = await pinnedGet(url, addresses, combined);
          const status = response.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = response.headers.location;
            response.destroy();
            if (!location || hop >= maxRedirects) throw new MiniMaxVideoError('failed', { detail: 'download' });
            current = new URL(location, url).href;
            continue;
          }
          if (status !== 200) { response.destroy(); throw new MiniMaxVideoError(status >= 500 ? 'unavailable' : 'failed', { detail: 'download' }); }
          const bytes = await bounded(response, Number(response.headers['content-length'] ?? NaN), maxBytes, () => response.destroy(),
            () => new MiniMaxVideoError('failed', { detail: 'download' }));
          return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        }
      } catch (error) {
        if (signal?.aborted) throw new MiniMaxVideoError('aborted');
        if (error instanceof MiniMaxVideoError) throw error;
        throw new MiniMaxVideoError('unavailable', { detail: 'download' });
      }
    },
  };
}
