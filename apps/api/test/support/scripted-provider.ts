import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** One scripted model response. Steps are consumed in order, one per provider request. */
export type ScriptedStep = {
  /** Text deltas, sent in order. */
  text?: readonly string[];
  /** Tool calls, sent after any text. */
  toolCalls?: readonly { name: string; args: Record<string, unknown> }[];
  /** Finish reason; defaults to `tool_calls` with tool calls, otherwise `stop`. */
  finish?: 'stop' | 'tool_calls' | 'length';
  /** Respond with this HTTP status and no stream. */
  status?: number;
  /** End the stream without a finish chunk or `[DONE]`. */
  incomplete?: boolean;
  /** Pause before anything (`before`) or after the first text delta (`mid`) until `release()`. */
  hold?: 'before' | 'mid';
  /** Spread the text deltas out by this many milliseconds each. */
  dripMs?: number;
};

export type RecordedRequest = { path: string; body: Record<string, unknown> };

/**
 * Loopback OpenAI-compatible chat-completions server for tests. It streams scripted text and tool
 * calls, can hold a step until released, and records every request. It also serves `/gate`, which
 * a test tool calls and which stays open until `openGate()`, so tests can hold a running tool.
 */
export async function scriptedProvider() {
  const steps: ScriptedStep[] = [];
  const requests: RecordedRequest[] = [];
  const unscripted: RecordedRequest[] = [];
  let toolCalls = 0;
  let releaseHold: (() => void) | undefined, holdReached: (() => void) | undefined;
  let held = new Promise<void>(resolve => { holdReached = resolve; });
  function newGate() {
    let open!: () => void, markReached!: () => void;
    const opened = new Promise<void>(resolve => { open = resolve; });
    const reached = new Promise<void>(resolve => { markReached = resolve; });
    return { open, opened, reached, markReached, aborted: false };
  }
  let gate = newGate();
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'scripted', object: 'chat.completion.chunk', created: 1, model: 'muse-spark-1.3', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function respond(request: IncomingMessage, response: ServerResponse, step: ScriptedStep) {
    const closed = new Promise<void>(resolve => response.once('close', () => resolve()));
    const hold = async () => {
      const released = new Promise<void>(resolve => { releaseHold = resolve; });
      holdReached?.();
      await Promise.race([released, closed]);
      held = new Promise<void>(resolve => { holdReached = resolve; });
    };
    if (step.hold === 'before') await hold();
    if (response.destroyed) return;
    if (step.status) { response.writeHead(step.status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Scripted failure' } })); return; }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(chunk({ role: 'assistant', content: '' }));
    for (const [index, text] of (step.text ?? []).entries()) {
      if (response.destroyed) return;
      response.write(chunk({ content: text }));
      if (index === 0 && step.hold === 'mid') await hold();
      if (step.dripMs) await wait(step.dripMs);
    }
    for (const [index, call] of (step.toolCalls ?? []).entries()) {
      // Unique for the provider's life, as a real provider's are: memory keys saved tool results by call id.
      response.write(chunk({ tool_calls: [{ index, id: `call_${++toolCalls}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] }));
    }
    if (step.incomplete) { response.end(); return; }
    response.write(chunk({}, step.finish ?? (step.toolCalls?.length ? 'tool_calls' : 'stop')));
    response.end('data: [DONE]\n\n');
  }

  const server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (part: string) => { raw += part; });
    request.on('end', () => {
      const path = request.url ?? '';
      if (path === '/gate') {
        const current = gate;
        current.markReached();
        response.once('close', () => { if (!response.writableFinished) current.aborted = true; });
        void current.opened.then(() => { if (!response.destroyed) response.end('{"released":true}'); });
        return;
      }
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(raw) as Record<string, unknown>; } catch { /* recorded as empty */ }
      const step = steps.shift();
      if (!step) { unscripted.push({ path, body }); response.writeHead(500).end(); return; }
      requests.push({ path, body });
      respond(request, response, step).catch(() => response.destroy());
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    /** OpenAI-compatible base URL for the model router. */
    url: `${url}/v1`,
    /** The `/gate` URL the gated test tool calls. */
    gateUrl: `${url}/gate`,
    script(...next: ScriptedStep[]) { steps.push(...next); },
    requests,
    unscripted,
    /** Resolves when a step reaches its hold point. */
    held: () => held,
    release() { releaseHold?.(); releaseHold = undefined; },
    gate: () => ({ reached: gate.reached, aborted: () => gate.aborted }),
    openGate() { gate.open(); },
    /** Clears scripts, records and gates between tests. */
    reset() {
      steps.length = 0; requests.length = 0; unscripted.length = 0;
      releaseHold?.(); releaseHold = undefined;
      gate.open(); gate = newGate();
    },
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
export type ScriptedProvider = Awaited<ReturnType<typeof scriptedProvider>>;
