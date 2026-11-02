import type { Mastra } from '@mastra/core';
import type { Context } from 'hono';
import { acceptsNativeTurns, activeNativeRun, createOwnedConversationCheck, hasNativeTurns, nameVideo, nativeAssistantId, turnLimits } from '../agent/index.js';
import { nativeControlRoutes, nativeRunAdmission } from './native-run-admission.js';
import { markConversationStarted } from './started-conversations.js';

export const nativeTurnRoutes = [...['send-message', 'threads/subscribe'].map(tail => ({ method: 'POST' as const, path: `/api/agents/${nativeAssistantId}/${tail}` })), ...nativeControlRoutes];
export const isNativeTurnRoute = (context: Context) => nativeTurnRoutes.some(route => route.path === context.req.path && route.method === context.req.method);
/** The turn routes that carry a turn's stream (send, subscribe, observe): every turn route but Stop. */
export const isTurnStreamRoute = (context: Context) => isNativeTurnRoute(context) && !context.req.path.endsWith('/threads/abort');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isSend = (context: Context) => context.req.path === `/api/agents/${nativeAssistantId}/send-message`;

/**
 * The admitted send body, with a busy thread's message discarded rather than merged into the running turn.
 * Admission already rejects a busy video and holds it until the send starts; this is defence in depth.
 */
export function nativeTurnBody(context: Context, body: unknown, bytes: Uint8Array<ArrayBuffer> | undefined): Uint8Array<ArrayBuffer> | undefined {
  return isSend(context) && object(body) ? new TextEncoder().encode(JSON.stringify({ ...body, ifActive: { behavior: 'discard' } })) : bytes;
}

/**
 * An admitted send holds its video until the native send settles; `release` must run once it has.
 * `accepted` runs after the native send was accepted, before the response leaves, so Recents lists the video.
 * Once the mark is written, it starts naming an untitled video from the message, without waiting for it.
 */
export type AdmittedSend = { accepted: () => Promise<void>; release: () => void };

/** Closed pre-native admission. Body resource is a stale-scope precondition, never ownership authority. */
export function nativeTurnAdmission(mastra: Mastra) {
  // Videos whose admitted send has not yet started its native run, so two sends cannot both pass the busy check.
  const starting = new Set<string>();
  const storage = mastra.getStorage();
  const checkOwned = storage ? createOwnedConversationCheck(storage) : undefined;
  const admitRun = nativeRunAdmission(mastra, checkOwned);
  return async (context: Context, accountId: string, body: unknown): Promise<Response | AdmittedSend | undefined> => {
    if (context.req.path.endsWith('/observe')) return admitRun(context, accountId, body);
    const fail = (status: 400 | 404 | 409 | 503, code: string, message: string) => context.json({ error: { code, message } }, status);
    const invalid = () => fail(400, 'invalid_input', 'Invalid native request');
    const unavailable = () => fail(503, 'integration_failure', 'Native turns unavailable');
    context.header('Cache-Control', 'no-store');
    const stopping = context.req.path.endsWith('/threads/abort');
    const send = isSend(context);
    const keys = stopping ? ['threadId', 'resourceId', 'expectedRunId', 'clearPendingSignals'] : send ? ['threadId', 'resourceId', 'message', 'ifIdle'] : ['threadId', 'resourceId', 'withInitialHistory'];
    if (new URL(context.req.url).search || !object(body) || Object.keys(body).some(key => !keys.includes(key)) || body.resourceId !== accountId) return invalid();
    if (!uuid(body.threadId)) return fail(404, 'not_found', 'Not found');
    if (stopping) {
      if (!uuid(body.expectedRunId) || (body.clearPendingSignals !== undefined && body.clearPendingSignals !== false)) return invalid();
    } else if (send) {
      if (typeof body.message !== 'string' || !body.message.trim() || Buffer.byteLength(body.message, 'utf8') > turnLimits.inputBytes) return invalid();
      if (body.ifIdle !== undefined && (!object(body.ifIdle) || Object.keys(body.ifIdle).length !== 1 || body.ifIdle.behavior !== 'wake')) return invalid();
    } else if (body.withInitialHistory !== undefined && body.withInitialHistory !== false) {
      // Saved history has its own bounded, privacy-filtered read interface. No raw native metadata here.
      return invalid();
    }
    if (!checkOwned || context.req.raw.signal.aborted) return unavailable();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const owned = await Promise.race([checkOwned(accountId, body.threadId), new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 3000); })]);
      if (context.req.raw.signal.aborted || !owned || owned.kind === 'unavailable') return unavailable();
      if (owned.kind !== 'owned') return fail(404, 'not_found', 'Not found');
      if (!hasNativeTurns(mastra)) return unavailable();
      // One active turn per video; there is no queue.
      if (!send) return undefined;
      // Observing and Stop still work while a shutdown drains; only a new turn is refused.
      if (!acceptsNativeTurns(mastra)) return unavailable();
      const videoId = body.threadId;
      if (starting.has(videoId) || activeNativeRun(mastra, accountId, videoId)) return fail(409, 'busy', 'The agent is still working on the last message.');
      starting.add(videoId);
      const message = String(body.message);
      return {
        accepted: async () => {
          const memory = await storage?.getStore('memory');
          if (!memory) throw new Error('Native memory unavailable');
          // A title save rewrites the thread row, so it starts only once the started mark is written.
          await markConversationStarted(memory, videoId, accountId, () => { void nameVideo(mastra, accountId, videoId, message); });
        },
        release: () => { starting.delete(videoId); },
      };
    } catch { return unavailable(); }
    finally { clearTimeout(timer); }
  };
}
