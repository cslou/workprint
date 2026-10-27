import { MastraClient, type RouteResponse, type CreateMemoryThreadResponse, type ListMemoryThreadsResponse, type ListMemoryThreadMessagesResponse } from '@mastra/client-js';

type NativeAgent = ReturnType<MastraClient['getAgent']>;
export type ConversationSubscription = Awaited<ReturnType<NativeAgent['subscribeToThread']>>;
export type ConversationChunk = Parameters<Parameters<ConversationSubscription['processDataStream']>[0]['onChunk']>[0];
export interface ConversationClient {
  create(title: string): Promise<CreateMemoryThreadResponse>;
  list(): Promise<ListMemoryThreadsResponse>;
  load(threadId: string): Promise<RouteResponse<'GET /memory/threads/:threadId'>>;
  history(threadId: string): Promise<ListMemoryThreadMessagesResponse>;
  send(threadId: string, message: string): Promise<RouteResponse<'POST /agents/:agentId/send-message'>>;
  queue(threadId: string, message: string): Promise<RouteResponse<'POST /agents/:agentId/queue-message'>>;
  subscribe(threadId: string): Promise<ConversationSubscription>;
  stop(threadId: string, expectedRunId: string): Promise<RouteResponse<'POST /agents/:agentId/threads/abort'>>;
}

export function createConversationClient(options: { baseUrl: string; resourceId: string; getToken: () => Promise<string | undefined> }): ConversationClient {
  const client = new MastraClient({
    baseUrl: options.baseUrl, retries: 0,
    fetch: async (input, init) => {
      const token = await options.getToken();
      if (!token) throw new Error('Authentication required');
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const signal = url.pathname.endsWith('/threads/subscribe') ? init?.signal :
        AbortSignal.any([AbortSignal.timeout(10000), ...(init?.signal ? [init.signal] : [])]);
      return fetch(input, { ...init, headers, ...(signal ? { signal } : {}) });
    },
  });
  const agent = client.getAgent('assistant');
  return {
    create: (title: string) => client.createMemoryThread({ agentId: 'assistant', resourceId: options.resourceId, title }),
    list: () => client.listMemoryThreads({ agentId: 'assistant', page: 0, perPage: 30 }),
    load: (threadId: string) => client.getMemoryThread({ agentId: 'assistant', threadId }).get(),
    history: (threadId: string) => client.getMemoryThread({ agentId: 'assistant', threadId }).listMessages({ page: 0, perPage: 100 }),
    send: (threadId: string, message: string) => agent.sendMessage({ resourceId: options.resourceId, threadId, message }),
    queue: (threadId: string, message: string) => agent.queueMessage({ resourceId: options.resourceId, threadId, message }),
    subscribe: (threadId: string) => agent.subscribeToThread({ threadId, withInitialHistory: { perPage: 100 } }),
    stop: (threadId: string, expectedRunId: string) => agent.abortThread({ threadId, expectedRunId }),
  };
}
