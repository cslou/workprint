import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [expired, setExpired] = useState(false);
  const immediate = useRef(false);
  const scopeKey = JSON.stringify([scope?.accountId ?? null, scope?.conversationId ?? null]);
  // A new viewer/source starts a fresh expiry policy; close and scope changes discard it.
  useEffect(() => { immediate.current = false; setExpired(false); }, [open, versionId, scopeKey]);
  useEffect(() => {
    if (!open) return;
    if (state.kind !== 'settled' || !state.result.ok) { setExpired(false); return; }
    const expires = Date.parse(state.result.value.expiresAt);
    if (!Number.isFinite(expires)) { setExpired(true); return; }
    if (expires <= Date.now()) {
      // One immediate reacquire per expiry. A refreshed response that is still
      // expired is terminal: no timer and no further requests.
      if (immediate.current) { setExpired(true); return; }
      immediate.current = true;
      reacquire();
      return;
    }
    immediate.current = false;
    setExpired(false);
    const timer = setTimeout(reacquire, Math.min(expires - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [open, state, reacquire, versionId, scopeKey]);
  return { state, reacquire, expired };
}
