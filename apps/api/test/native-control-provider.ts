import type { Mastra } from '@mastra/core';
import type { MastraModelConfig } from '@mastra/core/llm';
import { registerApiRoute } from '@mastra/core/server';
import type { Context, MiddlewareHandler } from 'hono';
import { ServerResponse } from 'node:http';
import { controlledTurnProvider } from './native-turn-provider.js';

type Model = Extract<MastraModelConfig, { specificationVersion: 'v2' }>;
type Part = Awaited<ReturnType<Model['doStream']>>['stream'] extends ReadableStream<infer P> ? P : never;
type Agent = Awaited<ReturnType<Mastra['getAgent']>>;

/** Disposable composition only: native work is still executed and persisted by Mastra. */
export function controlledNativeControlProvider() {
  const baseline = controlledTurnProvider();
  let calls = 0, active = 0, listeners = 0, cancelled = 0, aborted = 0, held = 0, heldListeners = 0, timers = 0, metadataObservers = 0;
  let nextBarrier: 'stop' | 'observe' | 'metadata' | undefined;
  let agent: Agent | undefined;
  const gates = new Map<number, () => void>();
  const barriers = new Set<() => void>();
  const knownRuns = new Set<string>();
  const subscriptions = new Map<string, Set<unknown>>();
  const aborts: { expectedRunId: string | undefined; aborted: boolean }[] = [];
  const state = () => {
    const activeRuns = agent?.listActiveThreadRuns() ?? [];
    for (const run of activeRuns) knownRuns.add(run.runId);
    return { ...baseline.state(), calls, active, listeners, cancelled, aborted, held, heldListeners, timers, metadataObservers,
      providerGates: [...gates.keys()], activeRuns, aborts: [...aborts],
      streamSubscriptions: [...subscriptions].reduce((total, [topic, callbacks]) => total + ([...knownRuns].some(id => topic.includes(id)) ? callbacks.size : 0), 0),
    };
  };
  const waitBarrier = () => new Promise<void>(resolve => {
    held++; timers++;
    let complete = false;
    const finish = () => { if (complete) return; complete = true; clearTimeout(timer); timers--; held--; barriers.delete(finish); resolve(); };
    const timer = setTimeout(finish, 4000); barriers.add(finish);
  });
  const model: Model = {
    specificationVersion: 'v2', provider: 'controlled-native-control', modelId: 'native-held-text', supportedUrls: {},
    async doGenerate() { throw new Error('Controlled native control is streaming only'); },
    async doStream(options) {
      const id = ++calls, signal = options.abortSignal; active++;
      let closed = false, controller: ReadableStreamDefaultController<Part>;
      const release = () => { if (closed) return false; closed = true; active--; gates.delete(id); if (signal) { signal.removeEventListener('abort', abort); listeners--; } return true; };
      const abort = () => { if (release()) { aborted++; controller.error(signal?.reason); } };
      return { stream: new ReadableStream<Part>({
        start(c) {
          controller = c;
          if (signal) { listeners++; signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); return; } }
          c.enqueue({ type: 'stream-start', warnings: [] }); c.enqueue({ type: 'text-start', id: `held-${id}` });
          c.enqueue({ type: 'text-delta', id: `held-${id}`, delta: `Partial ${id} ` });
          gates.set(id, () => {
            if (closed) return;
            c.enqueue({ type: 'text-delta', id: `held-${id}`, delta: 'complete.' }); c.enqueue({ type: 'text-end', id: `held-${id}` });
            c.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } });
            release(); c.close();
          });
        }, cancel() { if (release()) cancelled++; },
      }) };
    },
  };
  const handler = async (context: Context) => {
    if (context.req.method === 'POST') {
      const body: unknown = await context.req.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) return context.json({ invalid: true }, 400);
      if ('release' in body && typeof body.release === 'number' && gates.has(body.release)) gates.get(body.release)!();
      else if ('barrier' in body && (body.barrier === 'stop' || body.barrier === 'observe' || body.barrier === 'metadata')) nextBarrier = body.barrier;
      else if ('releaseTransport' in body && body.releaseTransport === true) for (const finish of [...barriers]) finish();
      else return context.json({ invalid: true }, 400);
    }
    return context.json(state());
  };
  const routes = (['GET', 'POST'] as const).map(method => registerApiRoute('/turn-test/control', { method, handler }));
  const instrument = (bound: Agent) => {
    agent = bound; baseline.instrument(bound);
    const observe = bound.observe.bind(bound);
    bound.observe = async (...args: Parameters<typeof observe>) => {
      knownRuns.add(args[0]);
      if (nextBarrier === 'metadata') { nextBarrier = undefined; await waitBarrier(); }
      const result = await observe(...args);
      if (!('detach' in result) || typeof result.detach !== 'function') throw new Error('Native public detach unavailable');
      const detach = result.detach.bind(result); let closed = false; metadataObservers++;
      return { ...result, detach() { detach(); if (!closed) { closed = true; metadataObservers--; } } };
    };
    const abort = bound.abortThreadStream.bind(bound);
    bound.abortThreadStream = options => { const value = abort(options); aborts.push({ expectedRunId: options.expectedRunId, aborted: value }); return value; };
  };
  const middleware: MiddlewareHandler = async (context, next) => {
    const kind = context.req.path.endsWith('/threads/abort') ? 'stop' : context.req.path.endsWith('/observe') ? 'observe' : undefined;
    if (context.req.method !== 'POST' || !kind || nextBarrier !== kind) return next();
    nextBarrier = undefined;
    const outgoing: unknown = context.env?.outgoing;
    if (!(outgoing instanceof ServerResponse)) throw new Error('Controlled native transport binding unavailable');
    let listening = false;
    const closed = () => { if (listening) { listening = false; heldListeners--; outgoing.off('close', closed); } };
    if (!outgoing.destroyed) { listening = true; heldListeners++; outgoing.once('close', closed); }
    try { await waitBarrier(); return await next(); } finally { closed(); }
  };
  const configure = (mastra: Mastra) => {
    mastra.setServerMiddleware([...mastra.getServerMiddleware(), { path: '*', handler: middleware }]);
    const bus = mastra.pubsub;
    const add = (topic: string, callback: unknown) => { let set = subscriptions.get(topic); if (!set) subscriptions.set(topic, set = new Set()); set.add(callback); };
    const remove = (topic: string, callback: unknown) => { const set = subscriptions.get(topic); set?.delete(callback); if (!set?.size) subscriptions.delete(topic); };
    const subscribe = bus.subscribe.bind(bus), replay = bus.subscribeWithReplay.bind(bus), offset = bus.subscribeFromOffset.bind(bus), unsubscribe = bus.unsubscribe.bind(bus);
    bus.subscribe = async (topic, callback) => { add(topic, callback); try { await subscribe(topic, callback); } catch (error) { remove(topic, callback); throw error; } };
    bus.subscribeWithReplay = async (topic, callback) => { add(topic, callback); try { await replay(topic, callback); } catch (error) { remove(topic, callback); throw error; } };
    bus.subscribeFromOffset = async (topic, index, callback) => { add(topic, callback); try { await offset(topic, index, callback); } catch (error) { remove(topic, callback); throw error; } };
    bus.unsubscribe = async (topic, callback) => { remove(topic, callback); await unsubscribe(topic, callback); };
  };
  return { model, routes, instrument, configure, state, beforeMastra: baseline.beforeMastra };
}

export type NativeControlState = ReturnType<ReturnType<typeof controlledNativeControlProvider>['state']>;
