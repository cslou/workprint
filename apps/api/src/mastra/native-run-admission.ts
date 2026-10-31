import type { Mastra } from '@mastra/core';
import type { Context } from 'hono';
import type { CheckOwnedConversation } from '../application/index.js';
import { hasNativeTurns, nativeAssistantId } from '../agent/index.js';

export const nativeControlRoutes = ['queue-message', 'threads/abort', 'observe'].map(tail => ({ method: 'POST' as const, path: `/api/agents/${nativeAssistantId}/${tail}` }));
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Resolve exact native run ownership; never accept a caller's scope or retain a run ledger. */
export function nativeRunAdmission(mastra: Mastra, checkOwned: CheckOwnedConversation | undefined) {
  return async (context: Context, accountId: string, body: unknown) => {
    const failure = (status: 400 | 404 | 503, code: string, message: string) => context.json({ error: { code, message } }, status);
    const unavailable = () => failure(503, 'integration_failure', 'Native observation unavailable');
    const missing = () => failure(404, 'not_found', 'Not found');
    context.header('Cache-Control', 'no-store');
    // Only complete replay has been qualified; a caller cannot skip the native start identity.
    if (new URL(context.req.url).search || !object(body) || Object.keys(body).some(key => !['runId', 'offset'].includes(key)) || !uuid(body.runId) || (body.offset !== undefined && body.offset !== 0)) return failure(400, 'invalid_input', 'Invalid native execution reference');
    if (!checkOwned || !hasNativeTurns(mastra) || context.req.raw.signal.aborted) return unavailable();
    const runId = body.runId;
    let ended = false, detach: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let cancel!: () => void;
    const cancelled = new Promise<Response>(resolve => { cancel = () => resolve(unavailable()); });
    const signal = context.req.raw.signal;
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const work = async () => {
      try {
        const observation = await mastra.getAgent(nativeAssistantId).observe(runId);
        if (!('detach' in observation) || typeof observation.detach !== 'function') return unavailable();
        const release = observation.detach.bind(observation);
        if (ended || signal.aborted) { release(); return unavailable(); }
        detach = release;
        // These identities come from the native execution, not RequestContext/body claims.
        const { threadId, resourceId } = observation;
        release(); detach = undefined;
        if (observation.runId !== runId || resourceId !== accountId || !uuid(threadId)) return missing();
        const owned = await checkOwned(accountId, threadId);
        if (ended || signal.aborted) return unavailable();
        return owned.kind === 'owned' ? undefined : owned.kind === 'not_found' ? missing() : unavailable();
      } catch { return unavailable(); }
    };
    try {
      return await Promise.race([work(), cancelled, new Promise<Response>(resolve => { timer = setTimeout(() => resolve(unavailable()), 3000); })]);
    } finally {
      ended = true; clearTimeout(timer); signal.removeEventListener('abort', cancel); detach?.();
    }
  };
}
