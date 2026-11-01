import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export type MediaSource = OperationResponse<'media'>;

/** Reacquire before expiry so a playing source can switch while its current URL still works. */
const refreshLead = (remainingMs: number) => Math.min(10_000, remainingMs / 2);

/**
 * Exact-version media access. The owning viewer supplies the client and scope;
 * this hook never resolves a version ID or keeps a URL beyond its expiry.
 * `source` keeps the last unexpired access for the same version and scope while a refresh is pending.
 */
export function useVersionMedia(client: ApiClient | null, scope: ReadScope | null, versionId: string, open: boolean) {
  const [generation, setGeneration] = useState(0);
  const read = useMemo(() => client && open ? (signal: AbortSignal) => client.media({ params: { id: versionId }, query: {}, body: {} }, { signal }) : null, [client, open, versionId, generation]);
  const state = useScopedRead(scope, read);
  const reacquire = useCallback(() => setGeneration((value) => value + 1), []);
  const [expired, setExpired] = useState(false);
  const immediate = useRef(false);
  const scopeKey = JSON.stringify([scope?.accountId ?? null, scope?.conversationId ?? null]);
  const identity = JSON.stringify([versionId, scopeKey]);
  const [held, setHeld] = useState<{ identity: string; client: ApiClient; value: MediaSource } | null>(null);
  useEffect(() => {
    if (state.kind !== 'settled') return;
    setHeld(client && state.result.ok && Date.parse(state.result.value.expiresAt) > Date.now() ? { identity, client, value: state.result.value } : null);
  }, [state, identity, client]);
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
    const remaining = expires - Date.now();
    const timer = setTimeout(reacquire, Math.min(remaining - refreshLead(remaining), 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [open, state, reacquire, versionId, scopeKey]);
  const settled = state.kind === 'settled' && state.result.ok ? state.result.value : null;
  const retained = state.kind === 'loading' && held?.identity === identity && held.client === client && Date.parse(held.value.expiresAt) > Date.now() ? held.value : null;
  const source = !open || expired ? null : settled ?? retained;
  return { state, reacquire, expired, source };
}
