import { errorEnvelopeSchema, errorStatus } from '@workprint/contracts';
import type { ClientResult } from './types.js';

type Messages = { invalid: string; tooLarge?: string; invalidError?: string };
const invalid = (message: string): ClientResult<never> => ({ ok: false, error: { code: 'invalid_response', message } });

/** Shared bounded wire decoding only; callers retain auth, cancellation and protocol guards. */
export async function readJsonResponse(response: Response, messages: Messages): Promise<ClientResult<{ bytes: ArrayBuffer; value: unknown }>> {
  const reader = response.body?.getReader();
  if (!reader) return invalid(messages.invalid);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); return invalid(messages.tooLarge ?? messages.invalid); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return invalid(messages.invalid); }
  if (!response.ok) {
    const decoded = errorEnvelopeSchema.safeParse(value);
    return decoded.success && errorStatus[decoded.data.error.code] === response.status
      ? { ok: false, error: decoded.data.error } : invalid(messages.invalidError ?? messages.invalid);
  }
  return { ok: true, value: { bytes: bytes.buffer, value } };
}
