import { useBindingSchema, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import type { ClientError, ClientResult } from './types.js';

type Command = OperationRequest<'useVersion'>;
type Result = OperationResponse<'useVersion'>;
export type VersionUseClient = { useVersion(command: Command, options?: { signal?: AbortSignal }): Promise<ClientResult<Result>> };
export type ExactVersionUseState = Readonly<{ phase: 'idle' | 'pending' | 'unknown' | 'rejected' | 'used'; failure: ClientError['code'] | null; result: Result | null }>;

/** Shared exact-result validation; presentation never grants use or selection authority. */
export async function requestVersionUse(client: VersionUseClient, command: Command, minimumSelectionRevision = 0, options: { signal?: AbortSignal } = {}): Promise<ClientResult<Result>> {
  const result = await client.useVersion(command, options);
  if (!result.ok) return result;
  const observed = useBindingSchema.safeParse(result.value.use.binding);
  // Bindings are closed objects; strip command-only fields before parsing.
  const binding = useBindingSchema.safeParse(Object.fromEntries(Object.entries(command.body).filter(([key]) => !['operationId', 'versionId'].includes(key))));
  if (!binding.success || !observed.success || result.value.use.versionId !== command.body.versionId || result.value.use.state !== 'approved' || result.value.selectionRevision < minimumSelectionRevision || JSON.stringify(observed.data) !== JSON.stringify(binding.data)) {
    return { ok: false, error: { code: 'invalid_response', message: 'The approved use did not match the requested exact version and binding.' } };
  }
  return result;
}

/** One immutable human command. Only explicit submit/retry sends; stop is not rollback. */
export function createExactVersionUse(config: { client: VersionUseClient; command: Command; minimumSelectionRevision?: number }) {
  const command = structuredClone(config.command);
  let state: ExactVersionUseState = { phase: 'idle', failure: null, result: null };
  let alive = true, generation = 0, observer: AbortController | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<ExactVersionUseState>) => { if (!alive) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const execute = async (): Promise<Result | undefined> => {
    if (!alive || state.phase === 'pending' || state.phase === 'used') return;
    const current = ++generation; observer = new AbortController(); update({ phase: 'pending', failure: null });
    let result: ClientResult<Result>;
    try { result = await requestVersionUse(config.client, command, config.minimumSelectionRevision, { signal: observer.signal }); }
    catch { result = { ok: false, error: { code: 'transport_failure', message: 'Use response unavailable' } }; }
    if (!alive || current !== generation) return;
    if (!result.ok) {
      const code = result.error.code;
      update({ phase: ['transport_failure', 'timed_out', 'cancelled', 'invalid_response', 'integration_failure'].includes(code) ? 'unknown' : 'rejected', failure: code });
      return;
    }
    update({ phase: 'used', result: result.value }); return result.value;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { if (!alive) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    submit() { return alive && ['idle', 'rejected'].includes(state.phase) ? execute() : Promise.resolve(undefined); },
    retry() { return alive && state.phase === 'unknown' ? execute() : Promise.resolve(undefined); },
    stop() { if (!alive || state.phase !== 'pending') return; ++generation; observer?.abort(); update({ phase: 'unknown', failure: 'cancelled' }); },
    dispose() { if (!alive) return; alive = false; ++generation; observer?.abort(); listeners.clear(); },
  };
}
export type ExactVersionUse = ReturnType<typeof createExactVersionUse>;
