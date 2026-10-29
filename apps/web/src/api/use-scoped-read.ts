import { useEffect, useState } from 'react';
import type { ClientResult } from '@workprint/api-client';

export type ReadScope = Readonly<{ accountId: string; conversationId?: string }>;
export type ReadState<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'settled'; result: ClientResult<T> };

/** Read-only lifecycle. Mutations must be explicit events, never effects/reconnect work. */
export function useScopedRead<T>(scope: ReadScope | null, read: ((signal: AbortSignal) => Promise<ClientResult<T>>) | null): ReadState<T> {
  const key = scope ? JSON.stringify([scope.accountId, scope.conversationId ?? null]) : null;
  const [snapshot, setSnapshot] = useState<{ key: string | null; read: typeof read; state: ReadState<T> }>({ key: null, read: null, state: { kind: 'idle' } });
  // Forget inactive identities during render, not a later passive effect: the same
  // scope/client must not recover an old settled snapshot on reactivation.
  if ((key === null || read === null) && (snapshot.key !== null || snapshot.read !== null)) {
    setSnapshot({ key: null, read: null, state: { kind: 'idle' } });
  }
  useEffect(() => {
    if (key === null || read === null) return;
    let current = true;
    const controller = new AbortController();
    setSnapshot({ key, read, state: { kind: 'loading' } });
    void read(controller.signal).then((result) => {
      if (current) setSnapshot({ key, read, state: { kind: 'settled', result } });
    }, () => {
      if (current) setSnapshot({ key, read, state: { kind: 'settled', result: { ok: false, error: { code: 'transport_failure', message: 'Read unavailable' } } } });
    });
    return () => { current = false; controller.abort(); };
  }, [key, read]);
  // Scope changes invalidate synchronously, before passive-effect cleanup.
  if (key === null || read === null) return { kind: 'idle' };
  if (snapshot.key !== key || snapshot.read !== read) return { kind: 'loading' };
  return snapshot.state;
}
