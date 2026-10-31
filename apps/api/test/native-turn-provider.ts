import type { Mastra } from '@mastra/core';
import type { MastraModelConfig } from '@mastra/core/llm';
import { registerApiRoute } from '@mastra/core/server';
import type { Context, MiddlewareHandler } from 'hono';
import { ServerResponse } from 'node:http';

type Model = Extract<MastraModelConfig, { specificationVersion: 'v2' }>;
type BoundAgent = Awaited<ReturnType<Mastra['getAgent']>>;
type Part = Awaited<ReturnType<Model['doStream']>>['stream'] extends ReadableStream<infer P> ? P : never;
export type TurnMode = 'complete' | 'formatted' | 'incomplete' | 'incomplete-slow' | 'failure' | 'at' | 'over' | 'before' | 'mid' | 'slow' | 'send-held' | 'subscribe-held';
const modes: readonly string[] = ['complete', 'formatted', 'incomplete', 'incomplete-slow', 'failure', 'at', 'over', 'before', 'mid', 'slow', 'send-held', 'subscribe-held'];

/** Only imported by the separately built test launcher; never an environment-selected model. */
export function controlledTurnProvider() {
  let mode: TurnMode = 'complete';
  let calls = 0, active = 0, listeners = 0, timers = 0, cancelled = 0, aborted = 0, observers = 0, pumps = 0, held = 0, heldListeners = 0;
  let current: { agent: BoundAgent; target: Parameters<BoundAgent['getActiveThreadRunId']>[0] } | undefined;
  const state = () => ({ calls, active, listeners, timers, cancelled, aborted, observers, pumps, held, heldListeners, activeRunId: current?.agent.getActiveThreadRunId(current.target) ?? null });
  const model: Model = {
    specificationVersion: 'v2', provider: 'controlled-qualification', modelId: 'native-text', supportedUrls: {},
    async doGenerate() { throw new Error('Controlled qualification is streaming only'); },
    async doStream(options) {
      calls++; active++;
      const behavior = mode, signal = options.abortSignal;
      let closed = false, controller: ReadableStreamDefaultController<Part> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let rejectCall: (reason?: unknown) => void;
      const release = (cancel = false) => {
        if (closed) return false;
        closed = true; active--; if (cancel) cancelled++;
        if (timer) { clearTimeout(timer); timer = undefined; timers--; }
        if (signal) { signal.removeEventListener('abort', abort); listeners--; }
        return true;
      };
      const abort = () => { if (release()) { aborted++; if (controller) controller.error(signal?.reason); else rejectCall(signal?.reason); } };
      const later = (work: () => void, milliseconds: number) => {
        timers++; timer = setTimeout(() => { timers--; timer = undefined; if (!closed) work(); }, milliseconds);
      };
      return new Promise<Awaited<ReturnType<Model['doStream']>>>((resolve, reject) => {
        rejectCall = reject;
        if (signal) { listeners++; signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); return; } }
        if (behavior === 'before') return;
        if (behavior === 'failure') { release(); reject(new Error('Controlled provider failure')); return; }
        resolve({ stream: new ReadableStream<Part>({
          start(c) {
            controller = c;
            c.enqueue({ type: 'stream-start', warnings: [] }); c.enqueue({ type: 'text-start', id: 'controlled' });
            const complete = () => {
              c.enqueue({ type: 'text-end', id: 'controlled' });
              c.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } });
              release(); c.close();
            };
            if (behavior === 'at' || behavior === 'over') {
              let emitted = 0;
              const tick = () => { if (emitted++ < (behavior === 'at' ? 64 : 65)) { c.enqueue({ type: 'text-delta', id: 'controlled', delta: 'a' }); later(tick, 2); } else if (behavior === 'at') complete(); };
              tick(); return;
            }
            if (behavior === 'mid') { c.enqueue({ type: 'text-delta', id: 'controlled', delta: 'Partial ' }); return; }
            if (behavior === 'incomplete-slow') {
              c.enqueue({ type: 'text-delta', id: 'controlled', delta: 'Controlled ' });
              later(() => { c.enqueue({ type: 'text-delta', id: 'controlled', delta: 'native answer.' }); release(); c.close(); }, 2500); return;
            }
            const answer = () => {
              c.enqueue({ type: 'text-delta', id: 'controlled', delta: behavior === 'formatted' ? ' \nControlled  café\t' : 'Controlled ' });
              c.enqueue({ type: 'text-delta', id: 'controlled', delta: behavior === 'formatted' ? 'answer. 🍿\n ' : 'native answer.' });
              if (behavior === 'incomplete') { release(); c.close(); } else complete();
            };
            if (behavior === 'slow') later(answer, 2500); else answer();
          },
          cancel() { release(true); },
        }) });
      });
    },
  };
  const handler = async (context: Context) => {
    if (context.req.method === 'POST') {
      const body: unknown = await context.req.json();
      if (active || !body || typeof body !== 'object' || !('mode' in body) || typeof body.mode !== 'string' || !modes.includes(body.mode)) return context.json({ invalid: true }, 400);
      mode = body.mode as TurnMode;
    }
    return context.json(state());
  };
  const routes = (['GET', 'POST'] as const).map(method => registerApiRoute('/turn-test/control', { method, handler }));
  const instrument = (agent: BoundAgent) => {
    const subscribe = agent.subscribeToThread.bind(agent);
    agent.subscribeToThread = (async (options: Parameters<typeof subscribe>[0]) => {
      const sub = await subscribe(options); observers++; current = { agent, target: options }; let closed = false;
      const stream = { async *[Symbol.asyncIterator]() { pumps++; try { for await (const part of sub.stream) yield part; } finally { pumps--; } } };
      return { ...sub, stream, unsubscribe() { sub.unsubscribe(); if (!closed) { closed = true; observers--; } } };
    }) as typeof subscribe;
  };
  const beforeMastra: MiddlewareHandler = async (context, next) => {
    const path = mode === 'send-held' ? '/api/agents/assistant/send-message' : mode === 'subscribe-held' ? '/api/agents/assistant/threads/subscribe' : undefined;
    if (!path || context.req.path !== path || context.req.method !== 'POST') return next();
    const outgoing: unknown = context.env?.outgoing;
    if (!(outgoing instanceof ServerResponse)) throw new Error('Controlled transport binding unavailable');
    held++;
    let closed!: () => void, attached = false;
    try {
      await new Promise<void>(resolve => {
        closed = resolve;
        if (outgoing.destroyed) resolve();
        else { attached = true; heldListeners++; outgoing.once('close', closed); }
      });
      return context.body(null, 204);
    } finally {
      if (attached) { outgoing.off('close', closed); heldListeners--; }
      held--;
    }
  };
  return { model, routes, instrument, beforeMastra };
}
