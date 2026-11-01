import { applicationError, operations, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { readJsonResponse } from './response.js';
import { createNativeNavigation, type NativeNavigation } from './native.js';
import { createNativeTurns, type NativeTurnMethods } from './native-turns.js';
import { createNativeControl, type NativeTurnControls } from './native-control.js';
export type { NativeStopInput, NativeStopReceipt, NativeRunInput, NativeRunObservation } from './native-control.js';
export type { NativeThread, NativeThreads, NativeMessages, NativeNavigation } from './native.js';
export { nativeTransportLimits } from './native-turns.js';
export type { NativeTurnScope, NativeTextInput, NativeSendReceipt, NativeObservedFinish, NativeObservedTurn, NativeTextDelta, NativeObservation } from './native-turns.js';

import type { ClientError, ClientResult, CallOptions } from './types.js';
export type { ClientError, ClientResult, CallOptions } from './types.js';
type ApplicationMethods = { [N in OperationName]: (input: OperationRequest<N>, options?: CallOptions) => Promise<ClientResult<OperationResponse<N>>> };
const nativeNames = ['createConversation', 'listConversations', 'loadConversation', 'loadMessages', 'sendText', 'subscribe', 'stop', 'queueText', 'observeTurn'] as const;
type NativeMethods = NativeNavigation & NativeTurnMethods & NativeTurnControls;
export type ApiClient = ApplicationMethods & { native: NativeMethods };
const fail = (code: ClientError['code'], message: string): ClientResult<never> => ({ ok: false, error: { code, message } });
// Native availability is independent of an application HTTP origin or session.
export const nativeConversations = Object.fromEntries(nativeNames.map((name) => [name, async () => ({ ok: false, error: applicationError('not_implemented', 'Native conversations are unavailable').error })])) as NativeMethods;

/** One bounded application transport. No retries, native protocol or human authority. */
export function createApiClient(config: { baseUrl: string; getAccessToken: () => Promise<string | null>; timeoutMs?: number }): ApiClient {
  const base = new URL(config.baseUrl);
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))) throw new Error('Invalid API origin');
  const timeoutMs = config.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('Invalid API deadline');

  async function call<N extends OperationName>(name: N, input: OperationRequest<N>, options: CallOptions = {}): Promise<ClientResult<OperationResponse<N>>> {
    const operation = operations[name];
    if (!operation.request.safeParse(input).success) return fail('invalid_input', 'Invalid application request');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};
    const interrupted = new Promise<ClientResult<never>>((resolve) => {
      onAbort = () => { controller.abort(); resolve(fail('cancelled', 'Request cancelled')); };
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => { controller.abort(); resolve(fail('timed_out', 'Request deadline exceeded')); }, timeoutMs);
    });
    const work = async (): Promise<ClientResult<OperationResponse<N>>> => {
      try {
        controller.signal.throwIfAborted();
        const token = await config.getAccessToken();
        controller.signal.throwIfAborted();
        const url = new URL(operation.path.replace(':id', encodeURIComponent('id' in input.params ? input.params.id : '')), base);
        for (const [key, value] of Object.entries(input.query)) if (value !== undefined) url.searchParams.set(key, String(value));
        const response = await fetch(url, {
          method: operation.method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(operation.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
          ...(operation.method !== 'GET' ? { body: JSON.stringify(input.body) } : {}),
          signal: controller.signal, redirect: 'error', credentials: 'omit',
        });
        const payload = await readJsonResponse(response, { invalid: 'Invalid API response', tooLarge: 'API response too large', invalidError: 'Invalid API error response' });
        if (!payload.ok) return payload;
        const decoded = operation.response.safeParse(payload.value.value);
        return decoded.success ? { ok: true, value: decoded.data as OperationResponse<N> } : fail('invalid_response', 'Invalid API response');
      } catch {
        // Deadline/cancellation races settle through interrupted, never raw error text.
        return controller.signal.aborted ? await interrupted : fail('transport_failure', 'API transport unavailable');
      }
    };
    try { return await Promise.race([interrupted, work()]); }
    finally { if (timer !== undefined) clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort); }
  }
  const methods = Object.fromEntries((Object.keys(operations) as OperationName[]).map((name) => [name, (input: OperationRequest<typeof name>, options?: CallOptions) => call(name, input, options)])) as ApplicationMethods;
  return { ...methods, native: { ...nativeConversations, ...createNativeNavigation(config), ...createNativeTurns(config), ...createNativeControl(config) } };
}
