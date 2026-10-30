import type { Mastra } from '@mastra/core';
import type { Context } from 'hono';
import { createOwnedConversationCheck, hasNativeTurns, nativeAssistantId, nativeTurnLimits } from '../agent/index.js';

export const nativeTurnRoutes = ['send-message', 'threads/subscribe'].map(tail => ({ method: 'POST' as const, path: `/api/agents/${nativeAssistantId}/${tail}` }));
export const isNativeTurnRoute = (context: Context) => nativeTurnRoutes.some(route => route.path === context.req.path && route.method === context.req.method);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Closed pre-native admission. Body resource is a stale-scope precondition, never ownership authority. */
export function nativeTurnAdmission(mastra: Mastra) {
  const storage = mastra.getStorage();
  const checkOwned = storage ? createOwnedConversationCheck(storage) : undefined;
  return async (context: Context, accountId: string, body: unknown) => {
    const fail = (status: 400 | 404 | 503, code: string, message: string) => context.json({ error: { code, message } }, status);
    const invalid = () => fail(400, 'invalid_input', 'Invalid native request');
    const unavailable = () => fail(503, 'integration_failure', 'Native turns unavailable');
    context.header('Cache-Control', 'no-store');
    const send = context.req.path.endsWith('/send-message');
    const keys = send ? ['threadId', 'resourceId', 'message', 'ifIdle'] : ['threadId', 'resourceId', 'withInitialHistory'];
    if (new URL(context.req.url).search || !object(body) || Object.keys(body).some(key => !keys.includes(key)) || body.resourceId !== accountId) return invalid();
    if (!uuid(body.threadId)) return fail(404, 'not_found', 'Not found');
    if (send) {
      if (typeof body.message !== 'string' || !body.message.trim() || Buffer.byteLength(body.message, 'utf8') > nativeTurnLimits.inputBytes) return invalid();
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
      return undefined;
    } catch { return unavailable(); }
    finally { clearTimeout(timer); }
  };
}
