import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelStallError, turnLimits, type NativeTurnModel } from '../../../src/agent/index.js';
import { withStallLimit } from '../../../src/agent/mastra/stall-limit.js';

test('production turn limits match the approved values', () => {
  assert.deepEqual({ ...turnLimits }, {
    inputBytes: 32768, maxOutputTokens: 32768, maxSteps: 100, stallMs: 120000, turnMs: 35 * 60 * 1000, cleanupMs: 3000, titleTokens: 1024, titleMs: 15000,
  });
  assert.ok(Object.isFrozen(turnLimits));
});

/** A minimal model whose stream is driven by the test. */
function fakeModel(respond: (signal: AbortSignal | undefined) => Promise<ReadableStream<unknown>>) {
  const seen: { signal?: AbortSignal } = {};
  const model = {
    specificationVersion: 'v2', provider: 'fake', modelId: 'fake', supportedUrls: {}, marker: 'kept',
    doGenerate: () => Promise.reject(new Error('unused')),
    async doStream(options: { abortSignal?: AbortSignal }) {
      if (options.abortSignal) seen.signal = options.abortSignal;
      return { stream: await respond(options.abortSignal), request: { body: 'kept' } };
    },
  };
  return { model: model as unknown as NativeTurnModel, seen };
}
const stream = (chunks: unknown[], everyMs: number, hangAfter = false) => new ReadableStream<unknown>({
  async start(controller) {
    for (const chunk of chunks) { await new Promise(resolve => setTimeout(resolve, everyMs)); controller.enqueue(chunk); }
    if (!hangAfter) controller.close();
  },
});
async function read(model: NativeTurnModel) {
  const result = await (model as unknown as { doStream(options: object): Promise<{ stream: ReadableStream<unknown>; request: unknown }> }).doStream({});
  const chunks: unknown[] = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  return { chunks, request: result.request };
}

test('a stream that keeps sending data is never cut off, however long it runs', async () => {
  const { model } = fakeModel(async () => stream([1, 2, 3, 4, 5, 6], 40));
  const limited = withStallLimit(model, 100);
  assert.deepEqual(await read(limited), { chunks: [1, 2, 3, 4, 5, 6], request: { body: 'kept' } });
  assert.equal((limited as unknown as { marker: string }).marker, 'kept');
});

test('no data for the stall limit fails the call and aborts the provider request', async () => {
  const { model, seen } = fakeModel(async () => stream([1], 5, true));
  await assert.rejects(read(withStallLimit(model, 60)), ModelStallError);
  assert.equal(seen.signal?.aborted, true);
});

test('a response that never starts also stalls', async () => {
  const { model, seen } = fakeModel(signal => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))));
  await assert.rejects(read(withStallLimit(model, 60)), ModelStallError);
  assert.equal(seen.signal?.aborted, true);
});

test('once stop fires, a running call is aborted and a new one is refused unsent', { timeout: 1000 }, async () => {
  const stop = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const running = fakeModel(async signal => new ReadableStream({
    start(controller) {
      signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      started();
    },
  }));
  const pending = read(withStallLimit(running.model, 10_000, stop.signal));
  const reason = new Error('Server shutting down');
  const rejected = assert.rejects(pending, error => error === reason);
  await ready;
  stop.abort(reason);
  await rejected;
  assert.equal(running.seen.signal?.aborted, true);
  let calls = 0;
  const later = fakeModel(async () => { calls++; return stream([1], 1); });
  await assert.rejects(read(withStallLimit(later.model, 10_000, stop.signal)), { message: 'Server shutting down' });
  assert.equal(calls, 0);
});
