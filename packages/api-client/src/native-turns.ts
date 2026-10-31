import { MastraClient, type SendAgentMessageParams } from '@mastra/client-js';
import { readJsonResponse } from './response.js';
import type { CallOptions, ClientError, ClientResult } from './types.js';

type Agent = ReturnType<MastraClient['getAgent']>;
type Subscription = Awaited<ReturnType<Agent['subscribeToThread']>>;
type Chunk = Parameters<NonNullable<Parameters<Subscription['processDataStream']>[0]['onChunk']>>[0];
export type NativeTurnScope = Required<Pick<SendAgentMessageParams, 'threadId' | 'resourceId'>>;
export type NativeTextInput = NativeTurnScope & { message: string };
export type NativeSendReceipt = { runId: string; inputMessageId: string };
/** Observed native stop, NOT a saved-completion acknowledgment. Reload the exact message ID separately. */
export type NativeObservedFinish = { runId: string; assistantMessageId: string };
export type NativeTextDelta = { runId: Chunk['runId']; text: string };
export type NativeObservation = {
  consume(runId: NativeSendReceipt['runId'], onText: (part: NativeTextDelta) => void): Promise<ClientResult<NativeObservedFinish>>;
  close(): void;
};
export type NativeTurnMethods = {
  sendText(input?: NativeTextInput, options?: CallOptions): Promise<ClientResult<NativeSendReceipt>>;
  subscribe(input?: NativeTurnScope, options?: CallOptions): Promise<ClientResult<NativeObservation>>;
};
export const nativeTransportLimits = Object.freeze({ inputBytes: 8192, outputBytes: 8192, wireBytes: 1024 * 1024, establishmentMs: 3000, observationMs: 9000 });
const failed = (code: ClientError['code'], message: string): ClientResult<never> => ({ ok: false, error: { code, message } });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const scoped = (value: unknown): value is NativeTurnScope => object(value) && uuid(value.threadId) && uuid(value.resourceId);
const unavailable = () => failed('not_implemented', 'Native conversations are unavailable');

function lifetime(milliseconds: number, options?: CallOptions) {
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

/** Official SDK transport/decoder only. No SSE parsing, retries, Stop or persisted conversation state. */
export function createNativeTurns(config: { baseUrl: string; getAccessToken(): Promise<string | null>; timeoutMs?: number }): NativeTurnMethods {
  const establishMs = Math.min(config.timeoutMs ?? nativeTransportLimits.establishmentMs, nativeTransportLimits.establishmentMs);
  const streamMs = Math.min(config.timeoutMs ?? nativeTransportLimits.observationMs, nativeTransportLimits.observationMs);
  const sdk = async (life: ReturnType<typeof lifetime>) => {
    life.controller.signal.throwIfAborted(); const token = await config.getAccessToken(); life.controller.signal.throwIfAborted();
    if (!token) { life.fail(failed('unauthenticated', 'Authentication required')); throw new Error('Native identity unavailable'); }
    const fetcher: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(url, { ...init, headers, signal: life.controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
      if (!response.ok || new URL(String(url)).pathname.endsWith('/send-message')) {
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
  };
  const caught = (life: ReturnType<typeof lifetime>) => life.failure ?? failed('transport_failure', 'Native transport unavailable');
  return {
    async sendText(input, options) {
      if (input === undefined) return unavailable();
      if (!scoped(input) || Object.keys(input).some(key => !['threadId', 'resourceId', 'message'].includes(key)) || typeof input.message !== 'string' || !input.message.trim() || new TextEncoder().encode(input.message).byteLength > nativeTransportLimits.inputBytes) return failed('invalid_input', 'Invalid native text input');
      const life = lifetime(establishMs, options);
      const work = async (): Promise<ClientResult<NativeSendReceipt>> => {
        try {
          const agent = await sdk(life); life.controller.signal.throwIfAborted();
          const value = await agent.sendMessage({ threadId: input.threadId, resourceId: input.resourceId, message: input.message, ifIdle: { behavior: 'wake' } });
          if (!object(value) || value.accepted !== true || !uuid(value.runId) || !object(value.signal) || !uuid(value.signal.id) || value.signal.id === value.runId || value.signal.type !== 'user' || value.signal.contents !== input.message) return failed('invalid_response', 'Invalid native send acknowledgment');
          return { ok: true, value: { runId: value.runId, inputMessageId: value.signal.id } };
        } catch { return caught(life); }
      };
      try { return await Promise.race([work(), life.interrupted]); } finally { life.end(); }
    },
    async subscribe(input, options) {
      if (input === undefined) return unavailable();
      if (!scoped(input) || Object.keys(input).some(key => !['threadId', 'resourceId'].includes(key))) return failed('invalid_input', 'Invalid native observation scope');
      const life = lifetime(establishMs, options);
      const work = async (): Promise<ClientResult<NativeObservation>> => {
        try {
          const subscription = await (await sdk(life)).subscribeToThread({ threadId: input.threadId, resourceId: input.resourceId, withInitialHistory: false });
          if (life.controller.signal.aborted) { subscription.unsubscribe(); return caught(life); }
          life.budget(streamMs);
          let consumed = false;
          const close = () => { life.fail(failed('cancelled', 'Native observation closed')); subscription.unsubscribe(); };
          return { ok: true, value: {
            close,
            async consume(expectedRunId, onText) {
              if (consumed) return failed('invalid_input', 'Native observation already consumed'); consumed = true;
              if (!uuid(expectedRunId)) { close(); return failed('invalid_input', 'Invalid native execution identity'); }
              let terminal: ClientResult<NativeObservedFinish> | undefined, runId: string | undefined, messageId: string | undefined, bytes = 0;
              const stop = (result: ClientResult<NativeObservedFinish>) => { terminal = result; subscription.unsubscribe(); life.end(); };
              const processing = async (): Promise<ClientResult<NativeObservedFinish>> => {
                try {
                  await subscription.processDataStream({ reconnect: false, onChunk: chunk => {
                    if (terminal || life.controller.signal.aborted || chunk.runId !== expectedRunId) return;
                    const payload: unknown = 'payload' in chunk ? chunk.payload : undefined;
                    if (chunk.type === 'start') {
                      if (runId || !uuid(chunk.runId) || !object(payload) || !uuid(payload.messageId)) return stop(failed('invalid_response', 'Invalid native execution identity'));
                      runId = chunk.runId; messageId = payload.messageId;
                    } else if (chunk.type === 'text-delta') {
                      if (!runId || chunk.runId !== runId || !object(payload) || typeof payload.text !== 'string') return stop(failed('invalid_response', 'Invalid native text delta'));
                      bytes += new TextEncoder().encode(payload.text).byteLength;
                      if (bytes > nativeTransportLimits.outputBytes) return stop(failed('invalid_response', 'Native output limit exceeded'));
                      onText({ runId, text: payload.text });
                    } else if (chunk.type === 'finish') {
                      const step: unknown = object(payload) ? payload.stepResult : undefined;
                      if (!runId || chunk.runId !== runId || !messageId || !object(step) || step.reason !== 'stop' || step.messageId !== messageId) return stop(failed('invalid_response', 'Native response did not complete'));
                      stop({ ok: true, value: { runId, assistantMessageId: messageId } });
                    } else if (chunk.type === 'error') {
                      const error: unknown = object(payload) ? payload.error : undefined;
                      stop(object(error) && error.name === 'MastraTimeoutError' ? failed('timed_out', 'Native execution deadline exceeded') : failed('integration_failure', 'Native execution failed'));
                    } else if (chunk.type === 'tripwire' || chunk.type === 'abort') stop(failed('integration_failure', 'Native output rejected or interrupted'));
                  } });
                  return terminal ?? life.failure ?? failed('invalid_response', 'Native stream ended without a terminal result');
                } catch { return terminal ?? caught(life); }
              };
              try { return await Promise.race([processing(), life.interrupted]); }
              finally { subscription.unsubscribe(); life.end(); }
            },
          } };
        } catch { life.end(); return caught(life); }
      };
      const result = await Promise.race([work(), life.interrupted]);
      if (!result.ok) life.end(); return result;
    },
  };
}
