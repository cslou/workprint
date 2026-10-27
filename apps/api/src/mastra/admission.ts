import type { IMastraAuthProvider, MiddlewareHandler } from '@mastra/core/server';
import type { Agent } from '@mastra/core/agent';
import { z } from 'zod';

const id = z.uuid();
const create = z.object({ resourceId: id, title: z.string().min(1).max(160).optional(), agentId: z.literal('assistant').optional() }).strict();
const send = z.object({ resourceId: id, threadId: id, message: z.string().min(1).max(4000) }).strict();
const subscribe = z.object({ threadId: id, withInitialHistory: z.union([z.literal(true), z.object({ perPage: z.number().int().min(1).max(100) }).strict()]).optional() }).strict();
const stop = z.object({ threadId: id, expectedRunId: id }).strict();
const query = z.object({ agentId: z.literal('assistant').optional(), page: z.coerce.number().int().min(0).max(1000).optional(), perPage: z.coerce.number().int().min(1).max(100).optional() }).strict();

export function conversationAdmission(agent: Agent, auth: IMastraAuthProvider<{ id: string }> | undefined, available: boolean): MiddlewareHandler {
  return async (context, next) => {
    const path = context.req.path;
    const method = context.req.method;
    if (path === '/health' && method === 'GET') return next();
    const memoryPath = /^\/api\/memory\/threads(?:\/([^/]+)(?:\/(messages))?)?$/.exec(path);
    const action = /^\/api\/agents\/assistant\/(send-message|queue-message|threads\/subscribe|threads\/abort)$/.exec(path)?.[1];
    const allowed = (memoryPath && (method === 'GET' || (method === 'POST' && !memoryPath[1]))) || (action && method === 'POST');
    if (!auth || !allowed) return context.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    const requestContext = context.get('requestContext');
    // Config middleware precedes native route authentication in this CLI adapter.
    // Verify through the same real Supabase provider before any admission/storage work.
    const authorization = context.req.header('Authorization');
    const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    const user = token ? await auth.authenticateToken(token, context.req.raw) : null;
    const owner = user?.id;
    if (!owner) return context.json({ error: { code: 'unauthenticated', message: 'Authentication required' } }, 401);
    if (['x-resource-id', 'x-thread-id', 'x-mastra-thread-id', 'x-request-context'].some((key) => context.req.header(key)) || context.req.header('x-mastra-client-type') === 'studio') {
      return context.json({ error: { code: 'invalid_input', message: 'Reserved context headers are not accepted' } }, 400);
    }
    const parsedQuery = query.safeParse(context.req.query());
    if (!parsedQuery.success) return context.json({ error: { code: 'invalid_input', message: 'Invalid query' } }, 400);
    let threadId = memoryPath?.[1];
    if (method === 'POST') {
      let body: unknown;
      try { body = await context.req.raw.clone().json(); } catch { return context.json({ error: { code: 'invalid_input', message: 'Invalid JSON' } }, 400); }
      const schema = action === 'send-message' || action === 'queue-message' ? send : action === 'threads/subscribe' ? subscribe : action === 'threads/abort' ? stop : create;
      const parsed = schema.safeParse(body);
      if (!parsed.success) return context.json({ error: { code: 'invalid_input', message: 'Invalid native request' } }, 400);
      if ('resourceId' in parsed.data && parsed.data.resourceId !== owner) return context.json({ error: { code: 'forbidden', message: 'Account claim does not match verified identity' } }, 403);
      if ('threadId' in parsed.data) threadId = parsed.data.threadId;
    }
    if (threadId) {
      if (!id.safeParse(threadId).success) return context.json({ error: { code: 'invalid_input', message: 'Invalid conversation identity' } }, 400);
      const memory = await agent.getMemory({ requestContext });
      const thread = await memory?.getThreadById({ threadId });
      if (!thread || thread.resourceId !== owner) return context.json({ error: { code: 'not_found', message: 'Conversation not found' } }, 404);
    }
    if ((action === 'send-message' || action === 'queue-message') && !available) {
      return context.json({ error: { code: 'not_implemented', message: 'Assistant model integration is unavailable' } }, 503);
    }
    return next();
  };
}
