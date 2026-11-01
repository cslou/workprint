import { randomUUID } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import type { MastraCompositeStore, MemoryStorage } from '@mastra/core/storage';
import type { Context } from 'hono';
import type { CheckOwnedConversation } from '../application/index.js';
import { readBody } from './body.js';

const maximumResponseBytes = 1024 * 1024;
const maximumPage = 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (context: Context, status: 400 | 401 | 404 | 503, code: string, message: string) => {
  context.header('Cache-Control', 'no-store');
  return context.json({ error: { code, message } }, status);
};
const invalid = (context: Context) => failure(context, 400, 'invalid_input', 'Invalid native request');
const missing = (context: Context) => failure(context, 404, 'not_found', 'Not found');
const unavailable = (context: Context) => failure(context, 503, 'integration_failure', 'Native storage unavailable');

function pagination(context: Context, fallback: number, accountId: string) {
  const query = new URL(context.req.url).searchParams;
  if ([...query.keys()].some(key => !['page', 'perPage', 'resourceId'].includes(key)) || [...new Set(query.keys())].some(key => query.getAll(key).length !== 1)) return null;
  if (query.has('resourceId') && query.get('resourceId') !== accountId) return null;
  const page = query.get('page') ?? '0', perPage = query.get('perPage') ?? String(fallback);
  if (!/^(0|[1-9][0-9]{0,3})$/.test(page) || Number(page) > maximumPage || !/^[1-9][0-9]?$/.test(perPage) || Number(perPage) > 50) return null;
  return { page: Number(page), perPage: Number(perPage) };
}

/** Qualified native wire shapes over supported native storage only; no Agent or second store. */
export function nativeNavigationRoutes(storage: Pick<MastraCompositeStore, 'getStore'>, checkOwned: CheckOwnedConversation) {
  const route = (method: 'GET' | 'POST', path: string, action: (context: Context, accountId: string, memory: MemoryStorage) => Promise<Response>) => registerApiRoute(path, { method, handler: async context => {
    const accountId: unknown = context.get('requestContext').get('accountId');
    if (typeof accountId !== 'string') return failure(context, 401, 'unauthenticated', 'Authentication required');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = async () => {
        const memory = await storage.getStore('memory');
        if (!memory || context.req.raw.signal.aborted) return unavailable(context);
        return action(context, accountId, memory);
      };
      // A timed-out write is uncertain, never a definite no-write response or retried here.
      return await Promise.race([work(), new Promise<Response>(resolve => { timer = setTimeout(() => resolve(unavailable(context)), 8000); })]);
    } catch { return unavailable(context); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  } });
  const json = (context: Context, value: unknown) => {
    const text = JSON.stringify(value);
    return Buffer.byteLength(text) > maximumResponseBytes ? unavailable(context) : context.body(text, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  };
  const threadView = (thread: { id: string; resourceId?: string | undefined; title?: string | undefined; createdAt: Date; updatedAt: Date }) => ({ id: thread.id, resourceId: thread.resourceId, title: thread.title, createdAt: thread.createdAt, updatedAt: thread.updatedAt, metadata: {} });
  const owned = async (context: Context, accountId: string) => {
    const id = context.req.param('threadId');
    if (!id || !uuid.test(id)) return missing(context);
    const result = await checkOwned(accountId, id);
    return result.kind === 'owned' ? id : result.kind === 'not_found' ? missing(context) : unavailable(context);
  };
  return [
    route('POST', '/memory/threads', async (context, accountId, memory) => {
      if (new URL(context.req.url).search) return invalid(context);
      const body = await readBody(context.req.raw);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('resourceId' in body) || body.resourceId !== accountId) return invalid(context);
      if (context.req.raw.signal.aborted) return unavailable(context);
      const now = new Date();
      const thread = await memory.saveThread({ thread: { id: randomUUID(), resourceId: accountId, title: '', metadata: {}, createdAt: now, updatedAt: now } });
      return json(context, threadView(thread));
    }),
    route('GET', '/memory/threads', async (context, accountId, memory) => {
      const page = pagination(context, 6, accountId); if (!page) return invalid(context);
      const result = await memory.listThreads({ ...page, filter: { resourceId: accountId }, orderBy: { field: 'createdAt', direction: 'DESC' } });
      return json(context, { threads: result.threads.map(threadView), total: result.total, page: result.page, perPage: result.perPage, hasMore: result.hasMore });
    }),
    route('GET', '/memory/threads/:threadId', async (context, accountId, memory) => {
      if (new URL(context.req.url).search) return invalid(context);
      const id = await owned(context, accountId); if (typeof id !== 'string') return id;
      const thread = await memory.getThreadById({ threadId: id, resourceId: accountId });
      return thread?.resourceId === accountId ? json(context, threadView(thread)) : missing(context);
    }),
    route('GET', '/memory/threads/:threadId/messages', async (context, accountId, memory) => {
      const page = pagination(context, 20, accountId); if (!page) return invalid(context);
      const id = await owned(context, accountId); if (typeof id !== 'string') return id;
      const result = await memory.listMessages({ ...page, threadId: id, resourceId: accountId, orderBy: { field: 'createdAt', direction: 'DESC' } });
      // Native normalization can omit unsupported stored roles while retaining the count.
      // Do not present that incomplete page as empty history or a complete boundary.
      const expected = Math.min(page.perPage, Math.max(0, result.total - page.page * page.perPage));
      if (result.messages.length !== expected) return unavailable(context);
      // Never expose private metadata, system instructions or tool payloads as browser state.
      const messages = result.messages.map(message => {
        const parts = message.content.parts;
        const signal = message.content.metadata?.signal;
        const userSignal = message.role === 'signal' && message.type === 'user' && signal !== null && typeof signal === 'object' &&
          'id' in signal && signal.id === message.id && 'type' in signal && signal.type === 'user' && 'tagName' in signal && signal.tagName === 'user';
        // Presentation role only: preserve the native input signal/message ID, never alias execution IDs.
        const role = userSignal ? 'user' : message.role;
        if (!['user', 'assistant'].includes(role) || message.threadId !== id || message.resourceId !== accountId || !parts || parts.some(part => part.type !== 'text')) throw new Error('Unsupported native history');
        return { id: message.id, threadId: id, resourceId: accountId, role, createdAt: message.createdAt, content: { format: 2, parts: parts.map(part => ({ type: 'text', text: 'text' in part ? part.text : '' })) } };
      });
      return json(context, { messages, total: result.total, page: result.page, perPage: result.perPage, hasMore: result.hasMore, uiMessages: null });
    }),
  ];
}
