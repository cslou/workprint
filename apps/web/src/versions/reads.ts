import { useMemo } from 'react';
import type { ApiClient } from '@workprint/api-client';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export function useExactVersion(client: ApiClient | null, scope: ReadScope | null, id: string) {
  const read = useMemo(() => client ? (signal: AbortSignal) => client.version({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  return useScopedRead(scope, read);
}
export function useVersionHistory(client: ApiClient | null, scope: ReadScope | null, artifactId: string, open: boolean) {
  const read = useMemo(() => client && open ? (signal: AbortSignal) => client.artifactVersions({ params: { id: artifactId }, query: {}, body: {} }, { signal }) : null, [client, artifactId, open]);
  return useScopedRead(scope, read);
}
