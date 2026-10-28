import { useMemo } from 'react';
import type { BrowserClient } from '../api/client.js';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export function useWorkspace(connection: BrowserClient, scope: ReadScope | null) {
  const client = connection.kind === 'configured' ? connection.client : null;
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? (signal: AbortSignal) => client.workspace({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  return useScopedRead(scope, read);
}
