import { useCallback, useMemo, useRef, useState } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import { applySavedVersion } from '../workspace/saved.js';
import type { ClientError } from '@workprint/api-client';
import type { BrowserClient } from '../api/client.js';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export type WorkspaceFailure = 'unauthenticated' | 'unavailable' | 'error';
export function classifyWorkspaceFailure(code: ClientError['code']): WorkspaceFailure {
  return code === 'unauthenticated' ? 'unauthenticated' : code === 'not_implemented' ? 'unavailable' : 'error';
}

export function useWorkspace(connection: BrowserClient, scope: ReadScope | null) {
  const client = connection.kind === 'configured' ? connection.client : null;
  const id = scope?.conversationId;
  const [refresh, setRefresh] = useState(0);
  const read = useMemo(() => { void refresh; return client && id ? (signal: AbortSignal) => client.workspace({ params: { id }, query: {}, body: {} }, { signal }) : null; }, [client, id, refresh]);
  const state = useScopedRead(scope, read);
  const key = JSON.stringify([scope?.accountId, scope?.conversationId]);
  const active = useRef(key); active.current = key;
  const [confirmed, setConfirmed] = useState<{ key: string; effects: Map<string, OperationResponse<'saveVersion'>> }>({ key, effects: new Map() });
  if (confirmed.key !== key) setConfirmed({ key, effects: new Map() });
  const onSaved = useCallback((result: OperationResponse<'saveVersion'>) => {
    if (active.current !== key || !result.use) return;
    setConfirmed(previous => {
      if (previous.key !== key || (previous.effects.get(result.use!.id)?.version.revision ?? -1) >= result.version.revision) return previous;
      const effects = new Map(previous.effects);
      if (!effects.has(result.use!.id) && effects.size >= 100) return previous;
      effects.set(result.use!.id, result);
      return { key, effects };
    });
  }, [key]);
  const visible = state.kind === 'settled' && state.result.ok && confirmed.key === key ? { ...state, result: { ok: true as const, value: [...confirmed.effects.values()].reduce(applySavedVersion, state.result.value) } } : state;
  const onUploaded = useCallback(() => { if (active.current !== key) return; setConfirmed({ key, effects: new Map() }); setRefresh(n => n + 1); }, [key]);
  return { ...visible, onSaved, onUploaded, failure: state.kind === 'settled' && !state.result.ok ? classifyWorkspaceFailure(state.result.error.code) : null };
}
