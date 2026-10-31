import { MastraClient } from '@mastra/client-js';
import { readJsonResponse } from './response.js';
import type { CallOptions, ClientError, ClientResult } from './types.js';
import type { NativeTextInput, NativeTurnScope } from './native-types.js';

export type NativeConfig = { baseUrl: string; getAccessToken(): Promise<string | null>; timeoutMs?: number };
export const nativeTransportLimits = Object.freeze({ inputBytes: 8192, outputBytes: 8192, wireBytes: 1024 * 1024, establishmentMs: 3000, observationMs: 9000 });
export const failed = (code: ClientError['code'], message: string): ClientResult<never> => ({ ok: false, error: { code, message } });
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const scoped = (value: unknown): value is NativeTurnScope => object(value) && uuid(value.threadId) && uuid(value.resourceId);
export const validNativeText = (value: unknown): value is NativeTextInput => scoped(value) && Object.keys(value).every(key => ['threadId', 'resourceId', 'message'].includes(key)) && 'message' in value && typeof value.message === 'string' && Boolean(value.message.trim()) && new TextEncoder().encode(value.message).byteLength <= nativeTransportLimits.inputBytes;
export const unavailableNative = () => failed('not_implemented', 'Native conversations are unavailable');

export function nativeLifetime(milliseconds: number, options?: CallOptions) {
  const controller = new AbortController();
  let failure: ClientResult<never> | undefined, timer: ReturnType<typeof setTimeout> | undefined, closed = false;
  let interrupt!: (result: ClientResult<never>) => void;
  const interrupted = new Promise<ClientResult<never>>(resolve => { interrupt = resolve; });
  const cleanup = () => { clearTimeout(timer); options?.signal?.removeEventListener('abort', cancelled); };
  const end = () => { if (!closed) { closed = true; cleanup(); controller.abort(); } };
  const fail = (result: ClientResult<never>) => { if (!closed) { failure = result; interrupt(result); end(); } };
  const cancelled = () => fail(failed('cancelled', 'Native observation/request cancelled'));
  const budget = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => fail(failed('timed_out', 'Native transport deadline exceeded')), ms); };
  budget(milliseconds); options?.signal?.addEventListener('abort', cancelled, { once: true }); if (options?.signal?.aborted) cancelled();
  return { controller, interrupted, end, fail, budget, get failure() { return failure; } };
}
export type NativeLifetime = ReturnType<typeof nativeLifetime>;
export const nativeCaught = (life: NativeLifetime) => life.failure ?? failed('transport_failure', 'Native transport unavailable');

/** Official SDK/decoder, shared finite HTTP budgets; no protocol framing, retry or replay. */
export async function nativeSdk(config: NativeConfig, life: NativeLifetime): Promise<ReturnType<MastraClient['getAgent']>> {
  life.controller.signal.throwIfAborted(); const token = await config.getAccessToken(); life.controller.signal.throwIfAborted();
  if (!token) { life.fail(failed('unauthenticated', 'Authentication required')); throw new Error('Native identity unavailable'); }
  const fetcher: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, signal: life.controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
    const path = new URL(String(url)).pathname;
    if (!response.ok || ['/send-message', '/queue-message', '/threads/abort'].some(tail => path.endsWith(tail))) {
      const decoded = await readJsonResponse(response, { invalid: 'Invalid native response' });
      if (!decoded.ok) { life.fail(decoded); throw new Error('Native request rejected'); }
      return new Response(decoded.value.bytes, { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (response.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'text/event-stream' || !response.body) {
      life.fail(failed('invalid_response', 'Invalid native stream')); throw new Error('Native stream unavailable');
    }
    let bytes = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > nativeTransportLimits.wireBytes) { life.fail(failed('invalid_response', 'Native stream too large')); throw new Error('Native stream bound exceeded'); }
      controller.enqueue(chunk);
    } }));
    return new Response(body, { status: response.status, headers: response.headers });
  };
  return new MastraClient({ baseUrl: config.baseUrl, retries: 0, credentials: 'omit', abortSignal: life.controller.signal, fetch: fetcher }).getAgent('assistant');
}

export function nativeSendReceipt(value: unknown, text: string): ClientResult<import('./native-types.js').NativeSendReceipt> {
  if (!object(value) || value.accepted !== true || !uuid(value.runId) || !object(value.signal) || !uuid(value.signal.id) || value.signal.id === value.runId || value.signal.type !== 'user' || value.signal.contents !== text) return failed('invalid_response', 'Invalid native send acknowledgment');
  return { ok: true, value: { runId: value.runId, inputMessageId: value.signal.id } };
}
