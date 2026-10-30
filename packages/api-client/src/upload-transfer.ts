import { MAX_UPLOAD_VIDEO_BYTES, operations, type OperationResponse } from '@workprint/contracts';
import type { ClientResult } from './result.js';

let active = 0;
type Grant = OperationResponse<'requestUpload'>;
const fail = (code: 'invalid_input' | 'not_found' | 'integration_failure' | 'cancelled' | 'timed_out' | 'transport_failure', message: string): ClientResult<never> => ({ ok: false, error: { code, message } });

/** A PUT acknowledgement is not verification/publication. No Auth provider, retry or confirmation. */
export async function transferUpload(grant: Grant, body: Blob, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<ClientResult<{ acknowledged: true }>> {
  if (!operations.requestUpload.response.safeParse(grant).success || !body.size || body.size > MAX_UPLOAD_VIDEO_BYTES || body.size > grant.maxBytes || !/^(image\/(png|jpeg)|video\/mp4)$/.test(body.type)) return fail('invalid_input', 'Invalid private transfer');
  let url: URL;
  try { url = new URL(grant.url); } catch { return fail('invalid_input', 'Invalid private transfer'); }
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) || !url.searchParams.has('X-Amz-Signature')) return fail('invalid_input', 'Invalid private transfer');
  if (Date.parse(grant.expiresAt) <= Date.now()) return fail('not_found', 'Private transfer grant expired');
  const timeoutMs = options.timeoutMs ?? 30000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) return fail('invalid_input', 'Invalid private transfer deadline');
  if (active >= 2) return fail('integration_failure', 'Private transfer capacity unavailable');
  if (options.signal?.aborted) return fail('cancelled', 'Transfer cancelled; stored bytes may exist');
  active++;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const interrupted = new Promise<ClientResult<never>>(resolve => {
    onAbort = () => { controller.abort(); resolve(fail('cancelled', 'Transfer cancelled; stored bytes may exist')); };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); resolve(fail('timed_out', 'Transfer not confirmed; stored bytes may exist')); }, timeoutMs);
  });
  let settled = false;
  const work = async (): Promise<ClientResult<{ acknowledged: true }>> => {
    try {
      controller.signal.throwIfAborted();
      const response = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': body.type }, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
      await response.body?.cancel();
      return response.ok ? { ok: true, value: { acknowledged: true } } : fail('transport_failure', 'Transfer not confirmed; stored bytes may exist');
    } catch { return fail('transport_failure', 'Transfer not confirmed; stored bytes may exist'); }
    finally { settled = true; active--; }
  };
  const pending = work();
  try { return await Promise.race([pending, interrupted]); }
  finally {
    if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort);
    // If a transport ignores cancellation, its capacity remains occupied until it actually settles.
    if (!settled) controller.abort();
  }
}
