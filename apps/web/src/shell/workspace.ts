import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OperationResponse, Version } from '@workprint/contracts';
import { useDraftGuard, useUncertainDrafts } from '../api/draft-guard.js';
import { applyUsedEffects } from '../workspace/used.js';
import { applySavedVersion } from '../workspace/saved.js';
import type { ClientError } from '@workprint/api-client';
import type { BrowserClient } from '../api/client.js';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export type WorkspaceFailure = 'unauthenticated' | 'unavailable' | 'error';
export function classifyWorkspaceFailure(code: ClientError['code']): WorkspaceFailure {
  return code === 'unauthenticated' ? 'unauthenticated' : code === 'not_implemented' ? 'unavailable' : 'error';
}

export function useWorkspace(connection: BrowserClient, scope: ReadScope | null) {
  const hasDrafts = useDraftGuard();
  const uncertain = useUncertainDrafts();
  const draftGuard = useRef({ active: hasDrafts, uncertain }); draftGuard.current = { active: hasDrafts, uncertain };
  const deferredUses = useRef(new Set<string>());
  const client = connection.kind === 'configured' ? connection.client : null;
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? (signal: AbortSignal) => client.workspace({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  const state = useScopedRead(scope, read);
  const key = JSON.stringify([scope?.accountId, scope?.conversationId]);
  const active = useRef(key); active.current = key;
  const [confirmed, setConfirmed] = useState<{ key: string; effects: Map<string, OperationResponse<'saveVersion'>> }>({ key, effects: new Map() });
  if (confirmed.key !== key) setConfirmed({ key, effects: new Map() });
  const onSaved = useCallback((result: OperationResponse<'saveVersion'>) => {
    if (active.current !== key || !result.use) return;
    // A replay of an earlier unknown save cannot replace a later explicit use.
    if (deferredUses.current.has(result.use.id)) return false;
    setUses(previous => previous.key === key ? { key, effects: previous.effects.filter(effect => effect.result.use.id !== result.use!.id) } : previous);
    setConfirmed(previous => {
      if (previous.key !== key || (previous.effects.get(result.use!.id)?.version.revision ?? -1) >= result.version.revision) return previous;
      const effects = new Map(previous.effects);
      if (!effects.has(result.use!.id) && effects.size >= 100) return previous;
      effects.set(result.use!.id, result);
      return { key, effects };
    });
  }, [key]);
  const [uses, setUses] = useState<{ key: string; effects: { result: OperationResponse<'useVersion'>; version: Version; deferred: boolean }[] }>({ key, effects: [] });
  const onUsed = useCallback((result: OperationResponse<'useVersion'>, version: Version) => {
    if (active.current !== key) return;
    const deferred = draftGuard.current.active;
    if (draftGuard.current.uncertain) deferredUses.current.add(result.use.id);
    setUses(previous => ({ key, effects: [...(previous.key === key ? previous.effects.filter(effect => effect.result.use.id !== result.use.id) : []), { result, version, deferred }].slice(-100) }));
  }, [key]);
  useEffect(() => {
    if (hasDrafts) return;
    deferredUses.current.clear();
    setUses(previous => previous.key === key && previous.effects.some(effect => effect.deferred) ? { key, effects: previous.effects.map(effect => ({ ...effect, deferred: false })) } : previous);
  }, [hasDrafts, key]);
  const visible = state.kind === 'settled' && state.result.ok && confirmed.key === key ? { ...state, result: { ok: true as const, value: [...confirmed.effects.values()].reduce(applySavedVersion, state.result.value) } } : state;
  const merged = visible.kind === 'settled' && visible.result.ok && uses.key === key ? { ...visible, result: { ok: true as const, value: applyUsedEffects(visible.result.value, uses.effects.filter(effect => !effect.deferred)) } } : visible;
  return { ...merged, onSaved, onUploaded: onSaved, onUsed, failure: state.kind === 'settled' && !state.result.ok ? classifyWorkspaceFailure(state.result.error.code) : null };
}
