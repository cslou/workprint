import { createExactVersionUse, type ExactVersionUse, type VersionUseClient } from '@workprint/api-client';
import type { OperationResponse, Version } from '@workprint/contracts';

export type LibraryChoice = Readonly<{ id: string; display: Readonly<{ name: string; sub: string; category?: string; image?: Readonly<{ src: string; alt: string }> }>; order: number; version?: Version; binding?: OperationResponse<'useVersion'>['use']['binding'] }>;
type InspectionTarget = Pick<Version, 'id' | 'artifactId' | 'revision' | 'kind' | 'builtIn'>;
type State = Readonly<{ choices: readonly LibraryChoice[]; phase: 'idle' | 'pending' | 'unknown' | 'rejected'; feedback: string | null }>;
const failure = (code: string) => code === 'unauthenticated' ? 'Sign-in required to attach from your Library. Nothing was attached.' : code === 'not_implemented' ? 'Attaching from your Library is not available yet. Nothing was attached.' : 'Nothing was attached. Your existing attachments are unchanged.';

/** Scope-owned local choices, not a scheduler/store. Close stops observation, never rolls back uses. */
export function createLibrarySelection(config: { getClient(): VersionUseClient | null; /** Read at use time: a New video gets its id on its first accepted send, without remounting. */ getConversationId(): string | undefined; onUsed?(result: OperationResponse<'useVersion'>, version: Version): void }) {
  const entries = new Map<string, { choice: LibraryChoice; conversationId: string | undefined; command: ExactVersionUse }>();
  // A choice picked on a New video before its first accepted send has no video id yet; attach rebuilds it once the id exists.
  const pickedUse = (id: string, choice: LibraryChoice) => createExactVersionUse({ client: { useVersion: (command, options) => { const client = config.getClient(); return client ? client.useVersion(command, options) : Promise.resolve({ ok: false, error: { code: 'transport_failure', message: 'Library connection unavailable' } }); } }, command: { params: { id: config.getConversationId() ?? '' }, query: {}, body: { ...(choice.binding ?? { purpose: 'reference' as const }), operationId: crypto.randomUUID(), versionId: id } } });
  const direct = new Map<string, ExactVersionUse>();
  const roles = new Map<string, string>();
  const inspections = new Map<string, InspectionTarget>();
  const listeners = new Set<() => void>();
  let state: State = { choices: [], phase: 'idle', feedback: null }, alive = true, generation = 0, attached = 0, total = 0;
  const update = (patch: Partial<State>) => { if (!alive) return; state = { ...state, ...patch, choices: [...entries.values()].map(entry => entry.choice).sort((a, b) => a.order - b.order) }; for (const listener of listeners) listener(); };
  const uncertain = () => `Attached ${attached} of ${total}. One use could not be confirmed. Retry checks the same exact choice. Closing does not undo a completed use.`;
  const locked = () => state.phase === 'pending' || state.phase === 'unknown';
  const toggle = (id: string, choice?: LibraryChoice) => {
    if (!alive || locked()) return;
    const existing = entries.get(id);
    if (existing) { existing.command.dispose(); entries.delete(id); }
    else if (choice && entries.size < 1000) {
      const captured = structuredClone(choice);
      if (new TextEncoder().encode(JSON.stringify([...state.choices, captured])).byteLength > 4 * 1024 * 1024) return;
      entries.set(id, { choice: captured, conversationId: config.getConversationId(), command: pickedUse(id, captured) });
    }
    attached = 0; total = 0; update({ phase: 'idle', feedback: null });
  };
  const attach = async () => {
    if (!alive || state.phase === 'pending' || entries.size === 0 || !config.getClient() || !config.getConversationId()) return;
    const current = ++generation;
    const conversationId = config.getConversationId();
    for (const [id, entry] of entries) if (entry.conversationId === undefined) { entry.command.dispose(); entries.set(id, { choice: entry.choice, conversationId, command: pickedUse(id, entry.choice) }); }
    if (total === 0) total = entries.size;
    const sequence = [...entries.values()].sort((a, b) => a.choice.order - b.choice.order);
    update({ phase: 'pending', feedback: null });
    for (const entry of sequence) {
      const result = await (entry.command.getSnapshot().phase === 'unknown' ? entry.command.retry() : entry.command.submit());
      if (!alive || current !== generation) return;
      if (!result) {
        const snapshot = entry.command.getSnapshot(), unknown = snapshot.phase === 'unknown';
        update({ phase: unknown ? 'unknown' : 'rejected', feedback: unknown ? uncertain() : attached > 0 ? `Attached ${attached} of ${total}. Remaining choices were not attached. Completed uses are unchanged.` : failure(snapshot.failure ?? 'invalid_input') });
        return;
      }
      entries.delete(entry.choice.id); entry.command.dispose(); attached++;
      if (entry.choice.version) config.onUsed?.(result, entry.choice.version); update({ phase: 'pending' });
    }
    attached = 0; total = 0; update({ phase: 'idle', feedback: null });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { if (!alive) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    toggle, attach,
    inspected(version: Version) { return inspections.get(version.artifactId) ?? version; },
    inspect(version: Version) { if (alive && (inspections.has(version.artifactId) || inspections.size < 1000)) inspections.set(version.artifactId, { id: version.id, artifactId: version.artifactId, revision: version.revision, kind: version.kind, ...(version.builtIn === undefined ? {} : { builtIn: version.builtIn }) }); },
    roleFor(id: string) { return roles.get(id) ?? ''; },
    setRole(id: string, role: string) { if (alive && (roles.has(id) || roles.size < 1000)) roles.set(id, role); },
    exactUse(version: Pick<Version, 'id'>, binding: OperationResponse<'useVersion'>['use']['binding']) {
      const key = JSON.stringify([config.getConversationId() ?? '', version.id, binding]);
      let command = direct.get(key);
      if (!command) {
        if (direct.size >= 1000) {
          const removable = [...direct].find(([, value]) => !['pending', 'unknown'].includes(value.getSnapshot().phase));
          if (removable) { removable[1].dispose(); direct.delete(removable[0]); }
        }
        const atCapacity = direct.size >= 1000;
        command = createExactVersionUse({ client: { useVersion: async (input, options) => {
          if (atCapacity) return { ok: false, error: { code: 'invalid_input', message: 'Reconcile existing exact uses before starting another.' } };
          const client = config.getClient();
          const result = client ? await client.useVersion(input, options) : { ok: false as const, error: { code: 'transport_failure' as const, message: 'Library connection unavailable' } };
          return result;
        } }, command: { params: { id: config.getConversationId() ?? '' }, query: {}, body: { ...binding, operationId: crypto.randomUUID(), versionId: version.id } } });
        if (!atCapacity) direct.set(key, command);
      }
      return command;
    },
    used(result: OperationResponse<'useVersion'>, version: Version) { if (alive) config.onUsed?.(result, version); },
    stop() { if (!alive || state.phase !== 'pending') return; ++generation; for (const entry of entries.values()) entry.command.stop(); update({ phase: 'unknown', feedback: uncertain() }); },
    dispose() { if (!alive) return; alive = false; ++generation; for (const entry of entries.values()) entry.command.dispose(); entries.clear(); for (const command of direct.values()) command.dispose(); direct.clear(); roles.clear(); inspections.clear(); listeners.clear(); },
  };
}
export type LibrarySelection = ReturnType<typeof createLibrarySelection>;
