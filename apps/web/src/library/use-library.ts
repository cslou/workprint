import { useCallback } from 'react';
import type { OperationRequest } from '@workprint/contracts';
import type { ApiClient } from '@workprint/api-client';
import { useScopedRead } from '../api/use-scoped-read.js';
import type { ReadScope } from '../api/use-scoped-read.js';

export function useLibrary(client: ApiClient | null, scope: ReadScope | null, query: OperationRequest<'library'>['query'] = {}) {
  const { kind, cursor, limit } = query;
  const read = useCallback((signal: AbortSignal) => {
    if (!client) throw new Error('Library client is not configured');
    return client.library({ params: {}, query: { ...(kind === undefined ? {} : { kind }), ...(cursor === undefined ? {} : { cursor }), ...(limit === undefined ? {} : { limit }) }, body: {} }, { signal });
  }, [client, kind, cursor, limit]);
  return useScopedRead(scope, client ? read : null);
}
