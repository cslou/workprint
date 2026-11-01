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

type Workspace = OperationResponse<'workspace'>;
/** An own confirmed save or use, stamped with the refresh count when it was confirmed. */
export type SaveEffect = OperationResponse<'saveVersion'> & { at: number };
export type UseEffect = { result: OperationResponse<'useVersion'>; version: Version; deferred: boolean; at: number };

/**
 * The workspace as shown: a settled read plus the own effects it doesn't cover yet. An effect confirmed before
 * a refresh was requested committed before that read began, so the read already shows it, or something newer
 * (such as a script the assistant saved since). Effects from before the read's refresh are therefore dropped.
 */
export function showWorkspace(read: Workspace, refresh: number, saves: Iterable<SaveEffect>, uses: readonly UseEffect[]): Workspace {
  const uncovered = <E extends { at: number }>(effects: Iterable<E>) => [...effects].filter(effect => effect.at >= refresh);
  return applyUsedEffects(uncovered(saves).reduce(applySavedVersion, read), uncovered(uses).filter(effect => !effect.deferred));
}

export function useWorkspace(connection: BrowserClient, scope: ReadScope | null) {
  const hasDrafts = useDraftGuard();
  const uncertain = useUncertainDrafts();
  const draftGuard = useRef({ active: hasDrafts, uncertain }); draftGuard.current = { active: hasDrafts, uncertain };
  const deferredUses = useRef(new Set<string>());
  const client = connection.kind === 'configured' ? connection.client : null;
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? (signal: AbortSignal) => client.workspace({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  // Each refresh re-reads in place; own effects carry the refresh count when they were confirmed.
  // The ref leads the state: an effect confirmed after a refresh is stamped with the new count at once.
  const [refreshes, setRefreshes] = useState(0);
  const clock = useRef(0), held = useRef(false);
  const reread = useCallback(() => { clock.current += 1; setRefreshes(clock.current); }, []);
  // A refresh waits while an editor is open, as a deferred use does, so saved work never changes under a draft.
  const refresh = useCallback(() => { if (draftGuard.current.active) held.current = true; else reread(); }, [reread]);
  const state = useScopedRead(scope, read, refreshes);
  const key = JSON.stringify([scope?.accountId, scope?.conversationId]);
  const active = useRef(key); active.current = key;
  const [confirmed, setConfirmed] = useState<{ key: string; effects: Map<string, SaveEffect> }>({ key, effects: new Map() });
  if (confirmed.key !== key) setConfirmed({ key, effects: new Map() });
  const onSaved = useCallback((result: OperationResponse<'saveVersion'>) => {
    if (active.current !== key || !result.use) return;
    // A replay of an earlier unknown save cannot replace a later explicit use.
    if (deferredUses.current.has(result.use.id)) return false;
    // Stamp now, not in an updater that may run after a later refresh.
    const at = clock.current;
    setUses(previous => previous.key === key ? { key, effects: previous.effects.filter(effect => effect.result.use.id !== result.use!.id) } : previous);
    setConfirmed(previous => {
      if (previous.key !== key || (previous.effects.get(result.use!.id)?.version.revision ?? -1) >= result.version.revision) return previous;
      const effects = new Map(previous.effects);
      if (!effects.has(result.use!.id) && effects.size >= 100) return previous;
      effects.set(result.use!.id, { ...result, at });
      return { key, effects };
    });
  }, [key]);
  const [uses, setUses] = useState<{ key: string; effects: UseEffect[] }>({ key, effects: [] });
  const onUsed = useCallback((result: OperationResponse<'useVersion'>, version: Version) => {
    if (active.current !== key) return;
    const deferred = draftGuard.current.active;
    if (draftGuard.current.uncertain) deferredUses.current.add(result.use.id);
    const at = clock.current;
    setUses(previous => ({ key, effects: [...(previous.key === key ? previous.effects.filter(effect => effect.result.use.id !== result.use.id) : []), { result, version, deferred, at }].slice(-100) }));
    // A use replaces the script without a revision check, and its confirmation can arrive late (a replayed
    // command). Re-read once: that read starts after the confirmation, so it covers the use and shows newer work.
    refresh();
  }, [key, refresh]);
  useEffect(() => {
    if (hasDrafts) return;
    if (held.current) { held.current = false; reread(); }
    deferredUses.current.clear();
    setUses(previous => previous.key === key && previous.effects.some(effect => effect.deferred) ? { key, effects: previous.effects.map(effect => ({ ...effect, deferred: false })) } : previous);
  }, [hasDrafts, key, reread]);
  const merged = state.kind === 'settled' && state.result.ok ? { ...state, result: { ok: true as const, value: showWorkspace(state.result.value, state.refresh ?? 0, confirmed.key === key ? confirmed.effects.values() : [], uses.key === key ? uses.effects : []) } } : state;
  return { ...merged, onSaved, onUploaded: onSaved, onUsed, refresh, failure: state.kind === 'settled' && !state.result.ok ? classifyWorkspaceFailure(state.result.error.code) : null };
}
