import type { ClientResult } from './types.js';
import type { NativeObservedTurn, NativeTextDelta } from './native-types.js';
import { failed, nativeTransportLimits, object, uuid } from './native-transport.js';

/** Per-observation decoder state only, never a stored turn/status or ownership ledger. */
export function nativeOutcome(expectedRunId: string, onText: (part: NativeTextDelta) => void) {
  let messageId: string | undefined, started = false, bytes = 0;
  const interrupted = (): ClientResult<NativeObservedTurn> => ({ ok: true, value: { outcome: 'interrupted', runId: expectedRunId, ...(messageId ? { assistantMessageId: messageId } : {}) } });
  const error = (value: unknown) => object(value) && value.name === 'MastraTimeoutError'
    ? failed('timed_out', 'Native execution deadline exceeded') : failed('integration_failure', 'Native execution failed');
  const chunk = (value: unknown): ClientResult<NativeObservedTurn> | undefined => {
    if (!object(value) || value.runId !== expectedRunId) return;
    const payload = value.payload;
    if (value.type === 'start') {
      if (started || !object(payload) || !uuid(payload.messageId)) return failed('invalid_response', 'Invalid native execution identity');
      started = true; messageId = payload.messageId;
    } else if (value.type === 'text-delta') {
      if (!started || !object(payload) || typeof payload.text !== 'string') return failed('invalid_response', 'Invalid native text delta');
      bytes += new TextEncoder().encode(payload.text).byteLength;
      if (bytes > nativeTransportLimits.outputBytes) return failed('invalid_response', 'Native output limit exceeded');
      onText({ runId: expectedRunId, text: payload.text });
    } else if (value.type === 'abort') return interrupted();
    else if (value.type === 'finish') {
      const step = object(payload) ? payload.stepResult : undefined;
      if (object(step) && step.reason === 'abort') return interrupted();
      if (!started || !messageId || !object(step) || step.reason !== 'stop' || step.messageId !== messageId) return failed('invalid_response', 'Native response did not complete');
      return { ok: true, value: { outcome: 'complete', runId: expectedRunId, assistantMessageId: messageId } };
    } else if (value.type === 'error') return error(object(payload) ? payload.error : undefined);
    else if (value.type === 'tripwire') return failed('integration_failure', 'Native output rejected or interrupted');
    return undefined;
  };
  const event = (value: unknown): ClientResult<NativeObservedTurn> | undefined => {
    if (!object(value) || value.runId !== expectedRunId) return;
    const data = value.data;
    if (value.type === 'finish') return chunk({ type: 'finish', runId: value.runId, payload: { stepResult: object(data) ? data.stepResult : undefined } });
    if (value.type === 'error') return error(object(data) ? data.error : undefined);
    if (object(data) && typeof data.type === 'string') {
      if (data.runId !== undefined && data.runId !== expectedRunId) return failed('invalid_response', 'Mismatched native execution identity');
      return chunk(data);
    }
    return undefined;
  };
  return { chunk, event };
}
