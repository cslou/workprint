import type { OperationRequest, OperationResponse, Version } from '@workprint/contracts';
import type { ClientError, ClientResult } from './result.js';

type Request = OperationRequest<'saveVersion'>;
type Result = OperationResponse<'saveVersion'>;
type ManualClient = {
  saveVersion(input: Request, options?: { signal?: AbortSignal }): Promise<ClientResult<Result>>;
  artifactVersions(input: OperationRequest<'artifactVersions'>, options?: { signal?: AbortSignal }): Promise<ClientResult<OperationResponse<'artifactVersions'>>>;
};
export type ManualTextTarget = Readonly<{
  read(version: Version): string | null;
  replace(version: Version, text: string): Request['body']['content'] | null;
  compatible(base: Version, latest: Version): boolean;
}>;
export type ManualSaveState = Readonly<{
  base: Version; editing: boolean; text: string;
  phase: 'idle' | 'pending' | 'rejected' | 'unknown' | 'conflict' | 'review-loading' | 'review-error' | 'review' | 'blocked';
  failure: ClientError['code'] | null; latest: Version | null; reviewed: boolean;
}>;
const same = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = Object.entries(left), b = Object.entries(right);
  return a.length === b.length && a.every(([key, value]) => Object.hasOwn(right, key) && same(value, (right as Record<string, unknown>)[key]));
};

/** Explicit-event command lifecycle. No retries/reads on construction, render or reconnect. */
export function createManualSave(config: { client: ManualClient; conversationId: string; version: Version; target: ManualTextTarget; intendedUse?: Request['body']['intendedUse'] }) {
  let state: ManualSaveState = { base: structuredClone(config.version), editing: false, text: '', phase: 'idle', failure: null, latest: null, reviewed: false };
  const listeners = new Set<() => void>();
  let alive = true, generation = 0;
  let captured: Request | null = null, observer: AbortController | null = null;
  const update = (patch: Partial<ManualSaveState>) => { if (!alive) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const editable = () => state.editing && state.phase !== 'pending' && state.phase !== 'unknown';
  const execute = async (command: Request): Promise<Result | undefined> => {
    if (!alive || state.phase === 'pending') return;
    const current = ++generation;
    observer?.abort(); observer = new AbortController();
    update({ phase: 'pending', failure: null });
    let result;
    try { result = await config.client.saveVersion(command, { signal: observer.signal }); }
    catch { result = { ok: false as const, error: { code: 'transport_failure' as const, message: 'Save response unavailable' } }; }
    if (!alive || current !== generation) return;
    if (!result.ok) {
      const code = result.error.code;
      const uncertain = ['transport_failure', 'timed_out', 'cancelled', 'invalid_response', 'integration_failure'].includes(code);
      update({ phase: uncertain ? 'unknown' : code === 'stale_revision' || code === 'superseded' ? 'conflict' : 'rejected', failure: code });
      return;
    }
    const next = result.value.version, use = result.value.use;
    const validUse = command.body.intendedUse ? !!use && use.versionId === next.id && use.state === 'approved' && same(use.binding, command.body.intendedUse) : use === undefined;
    if (!('content' in next) || next.kind !== command.body.kind || next.createdBy !== 'human' || next.artifactId !== command.body.artifactId || next.id === command.body.baseVersionId || next.revision !== state.base.revision + 1 || !same(next.content, command.body.content) || !same(next.dependencies, command.body.dependencies) || !validUse || config.target.read(next) === null) {
      update({ phase: 'unknown', failure: 'invalid_response' }); return;
    }
    captured = null;
    update({ base: next, editing: false, text: '', phase: 'idle', failure: null, latest: null, reviewed: false });
    return result.value;
  };
  const submit = async (): Promise<Result | undefined> => {
    if (!alive || !state.editing || !['idle', 'rejected'].includes(state.phase)) return;
    const content = config.target.replace(state.base, state.text);
    if (!content || !('content' in state.base)) { update({ phase: 'rejected', failure: 'invalid_input' }); return; }
    captured = structuredClone({ params: { id: config.conversationId }, query: {}, body: { operationId: crypto.randomUUID(), artifactId: state.base.artifactId, baseVersionId: state.base.id, kind: state.base.kind, content, dependencies: [...state.base.dependencies], ...(config.intendedUse ? { intendedUse: config.intendedUse } : {}) } });
    return execute(captured);
  };
  const reviewLatest = async () => {
    if (!alive || !state.editing || !['conflict', 'review-error', 'blocked'].includes(state.phase)) return;
    const current = ++generation;
    observer?.abort(); observer = new AbortController();
    update({ phase: 'review-loading', failure: null, latest: null });
    try {
      const result = await config.client.artifactVersions({ params: { id: state.base.artifactId }, query: { limit: 1 }, body: {} }, { signal: observer.signal });
      if (!alive || current !== generation) return;
      const latest = result.ok && result.value.items.length === 1 ? result.value.items[0] : null;
      if (!latest || latest.artifactId !== state.base.artifactId || latest.kind !== state.base.kind || latest.revision < state.base.revision) { update({ phase: 'review-error', failure: result.ok ? 'invalid_response' : result.error.code }); return; }
      update({ latest, phase: config.target.compatible(state.base, latest) && config.target.read(latest) !== null ? 'review' : 'blocked', failure: null });
    } catch { if (alive && current === generation) update({ phase: 'review-error', failure: 'transport_failure' }); }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { if (!alive) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    begin() { if (!alive || state.editing) return; const value = config.target.read(state.base); if (value !== null) update({ editing: true, text: value, phase: 'idle', failure: null, latest: null, reviewed: false }); },
    change(text: string) { if (editable()) update({ text }); },
    cancel() { if (!alive || state.phase === 'pending') return; ++generation; observer?.abort(); captured = null; update({ editing: false, text: '', phase: 'idle', failure: null, latest: null, reviewed: false }); },
    submit,
    retry() { return alive && state.phase === 'unknown' && captured ? execute(captured) : Promise.resolve(undefined); },
    reviewLatest,
    backToEdit() { if (alive && state.phase === 'review') update({ phase: 'conflict', latest: null }); },
    continueWithText() { if (alive && state.phase === 'review' && state.latest && config.target.compatible(state.base, state.latest)) { captured = null; update({ base: state.latest, phase: 'idle', failure: null, latest: null, reviewed: true }); } },
    dispose() { if (!alive) return; alive = false; ++generation; observer?.abort(); captured = null; listeners.clear(); },
  };
}
export type ManualSave = ReturnType<typeof createManualSave>;
