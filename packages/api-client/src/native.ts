import { MastraClient, type CreateMemoryThreadResponse, type ListMemoryThreadsResponse, type ListMemoryThreadMessagesResponse } from '@mastra/client-js';
import { readJsonResponse } from './response.js';
import type { CallOptions, ClientError, ClientResult } from './types.js';

export type NativeThread = CreateMemoryThreadResponse;
type BoundedPage = { page: number; perPage: number; total: number; hasMore: boolean };
export type NativeThreads = Omit<ListMemoryThreadsResponse, keyof BoundedPage> & BoundedPage;
type WireMessage = Omit<ListMemoryThreadMessagesResponse['messages'][number], 'createdAt'> & { createdAt: string };
export type NativeMessages = Omit<ListMemoryThreadMessagesResponse, keyof BoundedPage | 'messages'> & BoundedPage & { messages: WireMessage[] };
export type NativeNavigation = {
  createConversation(input?: { resourceId: string }, options?: CallOptions): Promise<ClientResult<NativeThread>>;
  listConversations(input?: { resourceId: string; page: number; perPage: number }, options?: CallOptions): Promise<ClientResult<NativeThreads>>;
  loadConversation(input?: { id: string; resourceId: string }, options?: CallOptions): Promise<ClientResult<NativeThread>>;
  loadMessages(input?: { id: string; resourceId: string; page: number; perPage: number }, options?: CallOptions): Promise<ClientResult<NativeMessages>>;
};
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const thread = (value: unknown): value is NativeThread => object(value) && uuid(value.id) && uuid(value.resourceId) && (value.title === undefined || typeof value.title === 'string') && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';
const page = (value: unknown, expected: { page: number; perPage: number }): value is Record<string, unknown> => object(value) && value.page === expected.page && value.perPage === expected.perPage && Number.isSafeInteger(value.total) && Number(value.total) >= 0 && typeof value.hasMore === 'boolean';
const failed = (code: ClientError['code'], message: string): ClientResult<never> => ({ ok: false, error: { code, message } });

/** Official native read client, no retries; native create uses the supported storage-backed wire adapter. */
export function createNativeNavigation(config: { baseUrl: string; getAccessToken(): Promise<string | null>; timeoutMs?: number }): NativeNavigation {
  async function call<T>(input: unknown, options: CallOptions | undefined, perform: (client: MastraClient, fetcher: typeof fetch) => Promise<unknown>, validate: (value: unknown) => value is T): Promise<ClientResult<T>> {
    // Legacy unavailable consumers have no verified scope and remain strictly local/effect-free.
    if (input === undefined) return failed('not_implemented', 'Native conversations are unavailable');
    const controller = new AbortController();
    const abort = () => controller.abort(); options?.signal?.addEventListener('abort', abort, { once: true });
    if (options?.signal?.aborted) abort();
    let error: ClientResult<never> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeCancellation = () => {};
    const deadline = new Promise<ClientResult<never>>(resolve => {
      const cancelled = () => resolve(error ?? failed('cancelled', 'Native request cancelled'));
      controller.signal.addEventListener('abort', cancelled, { once: true });
      removeCancellation = () => controller.signal.removeEventListener('abort', cancelled);
      if (controller.signal.aborted) cancelled();
      timer = setTimeout(() => { error = failed('timed_out', 'Native request deadline exceeded'); controller.abort(); }, config.timeoutMs ?? 10000);
    });
    const work = async (): Promise<ClientResult<T>> => {
      try {
        controller.signal.throwIfAborted();
        const token = await config.getAccessToken(); controller.signal.throwIfAborted();
        if (!token) return failed('unauthenticated', 'Authentication required');
        const fetcher: typeof fetch = async (url, init) => {
          controller.signal.throwIfAborted();
          const response = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` }, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
          const decoded = await readJsonResponse(response, { invalid: 'Invalid native response' });
          if (!decoded.ok) { error = decoded; throw new Error('Native request failed'); }
          return new Response(decoded.value.bytes, { status: response.status, headers: { 'Content-Type': 'application/json' } });
        };
        const client = new MastraClient({ baseUrl: config.baseUrl, apiPrefix: '', retries: 0, credentials: 'omit', fetch: fetcher });
        const result = await perform(client, fetcher);
        return validate(result) ? { ok: true, value: result } : failed('invalid_response', 'Invalid native response');
      } catch {
        return error ?? (controller.signal.aborted ? failed('cancelled', 'Native request cancelled') : failed('transport_failure', 'Native transport unavailable'));
      }
    };
    try { return await Promise.race([work(), deadline]); }
    finally { clearTimeout(timer); removeCancellation(); options?.signal?.removeEventListener('abort', abort); }
  }
  return {
    createConversation: (input, options) => call(input, options, async (_, fetcher) => (await fetcher(config.baseUrl + '/memory/threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json(), (value): value is NativeThread => thread(value) && value.resourceId === input?.resourceId),
    listConversations: (input, options) => call(input, options, client => client.listMemoryThreads(input), (value): value is NativeThreads => !!input && page(value, input) && Array.isArray(value.threads) && value.threads.length <= input.perPage && value.threads.every(item => thread(item) && item.resourceId === input.resourceId) && new Set(value.threads.map(item => item.id)).size === value.threads.length),
    loadConversation: (input, options) => call(input, options, client => client.getMemoryThread({ threadId: input!.id }).get(), (value): value is NativeThread => thread(value) && value.id === input?.id && value.resourceId === input.resourceId),
    loadMessages: (input, options) => call(input, options, client => client.listThreadMessages(input!.id, { resourceId: input!.resourceId, page: input!.page, perPage: input!.perPage }), (value): value is NativeMessages => !!input && page(value, input) && Array.isArray(value.messages) && value.messages.length <= input.perPage && value.messages.every(message => object(message) && uuid(message.id) && typeof message.createdAt === 'string' && message.threadId === input.id && message.resourceId === input.resourceId && ['user', 'assistant'].includes(String(message.role)) && object(message.content) && message.content.format === 2 && Array.isArray(message.content.parts) && message.content.parts.every(part => object(part) && part.type === 'text' && typeof part.text === 'string')) && new Set(value.messages.map(message => message.id)).size === value.messages.length),
  };
}
