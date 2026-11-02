import { projectToolActivity, stepLimitReason, type AgentTool, type ToolActivityState } from '../agent/index.js';

type Chunk = Record<string, unknown>;
const object = (value: unknown): value is Chunk => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Larger than any allowed event (the browser's whole-stream bound is 16 MiB); a bigger one ends the stream. */
const maximumEventCharacters = 16 * 1024 * 1024;
const errorName = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const toolStates: Readonly<Record<string, ToolActivityState>> = { 'tool-call': 'running', 'tool-result': 'done', 'tool-error': 'failed' };

/** An error's class name and, for our own step limit only, its message. Never provider text, stacks or paths. */
function safeError(error: unknown) {
  const name = object(error) && typeof error.name === 'string' && errorName.test(error.name) ? error.name : 'Error';
  return { name, message: object(error) && error.message === stepLimitReason ? stepLimitReason : 'The reply failed.' };
}
function safeStep(step: unknown) {
  return object(step) ? { ...(typeof step.reason === 'string' ? { reason: step.reason } : {}), ...(typeof step.messageId === 'string' ? { messageId: step.messageId } : {}) } : {};
}

/**
 * The browser-safe copy of one native stream chunk, or null to drop it. An allowlist: request bodies,
 * step results, usage, headers, tool arguments, results and errors never leave the server.
 */
export function safeNativeChunk(chunk: unknown, registry: readonly AgentTool[], fallbackRunId?: string): Chunk | null {
  if (!object(chunk) || typeof chunk.type !== 'string') return null;
  const runId = typeof chunk.runId === 'string' ? chunk.runId : fallbackRunId;
  if (runId === undefined) return null;
  const { type } = chunk, payload = object(chunk.payload) ? chunk.payload : {};
  const state = toolStates[type];
  if (state) {
    const activity = projectToolActivity(registry, { toolCallId: payload.toolCallId, toolName: payload.toolName, state, input: payload.args, output: payload.result });
    return activity ? { type: 'tool-activity', runId, payload: activity } : null;
  }
  if (type === 'start') return typeof payload.messageId === 'string' ? { type, runId, payload: { messageId: payload.messageId } } : null;
  if (type === 'text-delta') return typeof payload.text === 'string' ? { type, runId, payload: { text: payload.text } } : null;
  if (type === 'finish') return { type, runId, payload: { stepResult: safeStep(payload.stepResult) } };
  if (type === 'abort') return { type, runId };
  if (type === 'error') return { type, runId, payload: { error: safeError(payload.error) } };
  if (type === 'tripwire') return { type, runId, payload: payload.reason === stepLimitReason ? { reason: stepLimitReason } : {} };
  return null;
}

/** Run observation wraps chunks in `{ type, runId, data }` events; the same allowlist applies inside. */
function safeEvent(value: unknown, registry: readonly AgentTool[]): Chunk | null {
  if (!object(value) || !('data' in value) || 'payload' in value) return safeNativeChunk(value, registry);
  const { type, runId, data } = value;
  if (typeof runId !== 'string') return null;
  if (type === 'chunk') { const inner = safeNativeChunk(data, registry, runId); return inner ? { type, runId, data: inner } : null; }
  if (type === 'finish') return { type, runId, data: { stepResult: safeStep(object(data) ? data.stepResult : undefined) } };
  if (type === 'error') return { type, runId, data: { error: safeError(object(data) ? data.error : undefined) } };
  if (type === 'abort') return { type, runId };
  return null;
}

/** Re-frames a native server-sent event stream, keeping only browser-safe events. */
export function sanitizeNativeStream(body: ReadableStream<Uint8Array>, registry: readonly AgentTool[]): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  let buffered = '';
  const emit = (event: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (event.length > maximumEventCharacters) throw new Error('Native stream event too large');
    const lines = event.split(/\r?\n/).filter(Boolean);
    // Comments carry no data; keep them, since heartbeats keep an idle connection open.
    if (lines.length && lines.every(line => line.startsWith(':'))) { controller.enqueue(encoder.encode(`${lines.join('\n')}\n\n`)); return; }
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(line.startsWith('data: ') ? 6 : 5)).join('\n');
    if (!data) return;
    let value: unknown;
    try { value = JSON.parse(data); } catch { return; }
    const safe = safeEvent(value, registry);
    if (safe) controller.enqueue(encoder.encode(`data: ${JSON.stringify(safe)}\n\n`));
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      // Search only the new text (plus a separator's width of the old), so a long event is scanned once.
      const from = Math.max(0, buffered.length - 3);
      buffered += text;
      const separator = /\r?\n\r?\n/g;
      separator.lastIndex = from;
      let start = 0;
      for (let match = separator.exec(buffered); match; match = separator.exec(buffered)) {
        emit(buffered.slice(start, match.index), controller);
        start = match.index + match[0].length;
      }
      buffered = buffered.slice(start);
      if (buffered.length > maximumEventCharacters) throw new Error('Native stream event too large');
    },
    flush(controller) {
      buffered += decoder.decode();
      if (buffered.trim()) emit(buffered, controller);
    },
  }));
}

/** A native stream response, re-framed with only browser-safe events; anything else is returned unchanged. */
export function sanitizedNativeResponse(response: Response, registry: readonly AgentTool[]): Response {
  if (!response.ok || !response.body || response.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'text/event-stream') return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(sanitizeNativeStream(response.body, registry), { status: response.status, statusText: response.statusText, headers });
}
