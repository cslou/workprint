import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiClient } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export type MediaSource = OperationResponse<'media'>;

/**
 * Exact-version media access. The owning viewer supplies the client and scope;
 * this hook never resolves a version ID or keeps a URL beyond its expiry.
 */
export function useVersionMedia(client: ApiClient | null, scope: ReadScope | null, versionId: string, open: boolean) {
  const [generation, setGeneration] = useState(0);
  const read = useMemo(() => client && open ? (signal: AbortSignal) => client.media({ params: { id: versionId }, query: {}, body: {} }, { signal }) : null, [client, open, versionId, generation]);
  const state = useScopedRead(scope, read);
  const reacquire = useCallback(() => setGeneration((value) => value + 1), []);
  const expiresAt = open && state.kind === 'settled' && state.result.ok ? state.result.value.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now());
    const timer = setTimeout(reacquire, Math.min(delay, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [expiresAt, reacquire]);
  return { state, reacquire };
}
