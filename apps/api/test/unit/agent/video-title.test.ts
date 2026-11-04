import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { assistantModels, cleanTitle, createAssistantModel, titleInstructions, titleLength, type NativeTurnModel } from '../../../src/agent/index.js';
import { createVideoTitler } from '../../../src/agent/mastra/video-title.js';

const owner = 'owner', video = 'video';
const limits = { titleTokens: 1024, titleMs: 200 };

/** A model whose title stream the test supplies, recording each call's options. */
function fakeModel(respond: (signal: AbortSignal) => ReadableStream<unknown>, id = { provider: 'meta', modelId: 'muse-spark-1.3' }) {
  const calls: { prompt: unknown; maxOutputTokens: unknown; providerOptions: unknown; abortSignal: AbortSignal }[] = [];
  const model = { specificationVersion: 'v2', ...id, supportedUrls: {},
    doGenerate: () => Promise.reject(new Error('unused')),
    async doStream(options: { prompt: unknown; maxOutputTokens: unknown; providerOptions: unknown; abortSignal: AbortSignal }) { calls.push(options); return { stream: respond(options.abortSignal) }; } };
  return { model: model as unknown as NativeTurnModel, calls };
}
const text = (...deltas: string[]) => () => new ReadableStream<unknown>({ start(controller) {
  for (const delta of deltas) controller.enqueue({ type: 'text-delta', id: 't', delta });
  controller.enqueue({ type: 'finish' }); controller.close();
} });
/** Thread storage with one video, recording every patch. */
function fakeStorage(thread: { title: string; resourceId?: string; metadata?: Record<string, unknown> } = { title: '' }) {
  const patches: Record<string, unknown>[] = [];
  const memory = {
    getThreadById: async ({ threadId }: { threadId: string }) => threadId === video ? { id: video, resourceId: thread.resourceId ?? owner, title: thread.title, metadata: thread.metadata ?? {} } : null,
    patchThread: async (update: Record<string, unknown>) => { patches.push(update); },
  };
  return { storage: { getStore: async () => memory } as unknown as MastraCompositeStore, patches };
}

test('a title is one line without quotes or a full stop, at most 60 characters', () => {
  assert.equal(cleanTitle('  "Night swim\n at the lake."  '), 'Night swim at the lake');
  assert.equal(cleanTitle('“A quiet harbour”'), 'A quiet harbour');
  const long = cleanTitle('word '.repeat(30));
  assert.equal(titleLength, 60); assert.ok([...long].length <= 60); assert.ok(!long.endsWith(' '));
  assert.equal([...cleanTitle('é'.repeat(80))].length, 60);
  assert.equal(cleanTitle('  \n '), '');
  assert.equal(cleanTitle('"Night swim".'), 'Night swim');
  assert.equal(cleanTitle('Title: **Night swim**'), 'Night swim');
  assert.equal(cleanTitle("The Boys'"), "The Boys'");
  assert.equal(cleanTitle(`"Rock" and 'Roll'`), `"Rock" and 'Roll'`, 'only a matching pair is unwrapped');
  assert.equal(cleanTitle("'Tis the Boys'"), "'Tis the Boys'");
  // A family emoji is one character people see; it is kept whole or dropped, never split.
  const family = '\u{1F469}\u200D\u{1F469}\u200D\u{1F467}';
  assert.equal(cleanTitle(`${'a'.repeat(59)}${family}b`), `${'a'.repeat(59)}${family}`);
});

test('an untitled video gets one capped, minimal-effort call and a title-only save', async () => {
  const { model, calls } = fakeModel(text('Night ', 'swim'));
  const { storage, patches } = fakeStorage({ title: '', metadata: { workprintStarted: true } });
  await createVideoTitler(model, storage, limits)(owner, video, 'A short film about a night swim');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.maxOutputTokens, 1024);
  assert.deepEqual(calls[0]!.providerOptions, { openai: { reasoningEffort: 'minimal' }, meta: { reasoningEffort: 'minimal' } });
  assert.deepEqual(calls[0]!.prompt, [{ role: 'system', content: titleInstructions }, { role: 'user', content: [{ type: 'text', text: 'A short film about a night swim' }] }]);
  assert.deepEqual(patches, [{ id: video, title: 'Night swim' }], 'never metadata');
});

test('a model not qualified for title options gets none, rather than Muse Spark\'s', async () => {
  const { model, calls } = fakeModel(text('Plain'), { provider: 'other', modelId: 'model' });
  await createVideoTitler(model, fakeStorage().storage, limits)(owner, video, 'Hello');
  assert.deepEqual(calls[0]!.providerOptions, {});
});

for (const id of assistantModels) test(`the production ${id} route sends minimal reasoning effort and the 1,024-token cap`, async t => {
  // The real model factory and router, with fetch answered locally: no network.
  const bodies: Record<string, unknown>[] = [];
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 1, model: 'muse-spark-1.3', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(chunk({ role: 'assistant', content: 'Night swim' }) + chunk({}, 'stop') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  const { storage, patches } = fakeStorage();
  await createVideoTitler(createAssistantModel({ model: id, apiKey: 'placeholder-key' }), storage, limits)(owner, video, 'A night swim');
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0]!.reasoning_effort, 'minimal'); assert.equal(bodies[0]!.max_tokens, 1024);
  assert.deepEqual(patches, [{ id: video, title: 'Night swim' }]);
});

test('a titled, missing or foreign video makes no call', async () => {
  for (const [thread, id] of [[{ title: 'Kept' }, video], [{ title: '' }, 'missing'], [{ title: '', resourceId: 'someone' }, video]] as const) {
    const { model, calls } = fakeModel(text('Unused'));
    const { storage, patches } = fakeStorage(thread);
    await createVideoTitler(model, storage, limits)(owner, id, 'Hello');
    assert.equal(calls.length, 0); assert.deepEqual(patches, []);
  }
});

test('a call held past the deadline is aborted and saves nothing; a failure saves nothing; neither rejects', async () => {
  const held = fakeModel(() => new ReadableStream<unknown>({ start(controller) { controller.enqueue({ type: 'text-delta', id: 't', delta: 'Too late' }); } }));
  const slow = fakeStorage();
  const started = Date.now();
  await createVideoTitler(held.model, slow.storage, limits)(owner, video, 'Hello');
  assert.ok(Date.now() - started < 1000);
  assert.equal(held.calls[0]!.abortSignal.aborted, true, 'the provider request is cancelled');
  assert.deepEqual(slow.patches, []);

  const failing = fakeModel(() => { throw new Error('provider said no'); });
  const failed = fakeStorage();
  await createVideoTitler(failing.model, failed.storage, limits)(owner, video, 'Hello');
  assert.deepEqual(failed.patches, []);
});

test('a hung thread read is bounded by the same deadline, and the video can be named by a later message', async () => {
  const { model, calls } = fakeModel(text('Later'));
  let hang = true;
  const patches: Record<string, unknown>[] = [];
  const memory = {
    getThreadById: () => hang ? new Promise(() => {}) : Promise.resolve({ id: video, resourceId: owner, title: '', metadata: {} }),
    patchThread: async (update: Record<string, unknown>) => { patches.push(update); },
  };
  const name = createVideoTitler(model, { getStore: async () => memory } as unknown as MastraCompositeStore, limits);
  const started = Date.now();
  await name(owner, video, 'One');
  assert.ok(Date.now() - started < 1000); assert.equal(calls.length, 0);
  hang = false;
  await name(owner, video, 'Two');
  assert.deepEqual(patches, [{ id: video, title: 'Later' }]);
});

test('while one title call is running for a video, another message makes no second call', async () => {
  let finish!: () => void;
  const { model, calls } = fakeModel(() => new ReadableStream<unknown>({ start(controller) {
    finish = () => { controller.enqueue({ type: 'text-delta', id: 't', delta: 'Once' }); controller.close(); };
  } }));
  const { storage, patches } = fakeStorage();
  const name = createVideoTitler(model, storage, { ...limits, titleMs: 5000 });
  const first = name(owner, video, 'One');
  await name(owner, video, 'Two');
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  finish(); await first;
  assert.equal(calls.length, 1); assert.deepEqual(patches, [{ id: video, title: 'Once' }]);
});
