import { applicationError, errorEnvelopeSchema, errorStatus, operations, type ErrorEnvelope, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';

export type ClientError = ErrorEnvelope['error'] | { code: 'transport_failure' | 'timed_out' | 'cancelled' | 'invalid_response'; message: string };
export type ClientResult<T> = { ok: true; value: T } | { ok: false; error: ClientError };
export type CallOptions = { signal?: AbortSignal };
type ApplicationMethods = { [N in OperationName]: (input: OperationRequest<N>, options?: CallOptions) => Promise<ClientResult<OperationResponse<N>>> };
const nativeNames = ['createConversation', 'listConversations', 'loadConversation', 'sendText', 'subscribe', 'stop'] as const;
type NativeMethods = Record<(typeof nativeNames)[number], () => Promise<ClientResult<never>>>;
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
        const reader = response.body?.getReader();
        if (!reader) return fail('invalid_response', 'Invalid API response');
        let size = 0;
        const chunks: Uint8Array[] = [];
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1024 * 1024) { await reader.cancel(); return fail('invalid_response', 'API response too large'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let payload: unknown;
        try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { return fail('invalid_response', 'Invalid API response'); }
        if (!response.ok) {
          const decoded = errorEnvelopeSchema.safeParse(payload);
          return decoded.success && errorStatus[decoded.data.error.code] === response.status
            ? { ok: false, error: decoded.data.error } : fail('invalid_response', 'Invalid API error response');
        }
        const decoded = operation.response.safeParse(payload);
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
  return { ...methods, native: nativeConversations };
}
