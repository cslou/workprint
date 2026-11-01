import { useEffect, useState } from 'react';
import type { ClientResult } from '@workprint/api-client';

export type ReadScope = Readonly<{ accountId: string; conversationId?: string }>;
/** A settled read says which refresh started it (0 for the first read of a scope). */
export type ReadState<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'settled'; result: ClientResult<T>; refresh?: number };
type Reader<T> = ((signal: AbortSignal) => Promise<ClientResult<T>>) | null;
export type ReadSnapshot<T> = { key: string | null; read: Reader<T>; state: ReadState<T> };

/**
 * Lands a read result. A result for another scope or reader never lands. A failed refresh keeps the value
 * already shown, so a passing network fault never blanks the page.
 */
export function landRead<T>(previous: ReadSnapshot<T>, next: ReadSnapshot<T> & { state: { kind: 'settled' } }): ReadSnapshot<T> {
  if (previous.key !== next.key || previous.read !== next.read) return previous;
  if (!next.state.result.ok && previous.state.kind === 'settled' && previous.state.result.ok) return previous;
  return next;
}

/**
 * Read-only lifecycle. Mutations must be explicit events, never effects/reconnect work.
 * Changing `refresh` re-reads the same scope in place: the settled value stays until the new one lands.
 */
export function useScopedRead<T>(scope: ReadScope | null, read: Reader<T>, refresh = 0): ReadState<T> {
  const key = scope ? JSON.stringify([scope.accountId, scope.conversationId ?? null]) : null;
  const [snapshot, setSnapshot] = useState<ReadSnapshot<T>>({ key: null, read: null, state: { kind: 'idle' } });
  // Forget inactive identities during render, not a later passive effect: the same
  // scope/client must not recover an old settled snapshot on reactivation.
  if ((key === null || read === null) && (snapshot.key !== null || snapshot.read !== null)) {
    setSnapshot({ key: null, read: null, state: { kind: 'idle' } });
  }
  useEffect(() => {
    if (key === null || read === null) return;
    let current = true;
    const controller = new AbortController();
    setSnapshot(previous => previous.key === key && previous.read === read && previous.state.kind === 'settled' ? previous : { key, read, state: { kind: 'loading' } });
    const land = (result: ClientResult<T>) => { if (current) setSnapshot(previous => landRead(previous, { key, read, state: { kind: 'settled', result, refresh } })); };
    void read(controller.signal).then(land, () => land({ ok: false, error: { code: 'transport_failure', message: 'Read unavailable' } }));
    return () => { current = false; controller.abort(); };
  }, [key, read, refresh]);
  // Scope changes invalidate synchronously, before passive-effect cleanup.
  if (key === null || read === null) return { kind: 'idle' };
  if (snapshot.key !== key || snapshot.read !== read) return { kind: 'loading' };
  return snapshot.state;
}
