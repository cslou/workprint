import type { ClientError, ClientResult } from './result.js';

export type ReadPage<T> = { items: T[]; nextCursor: string | null };
export type PageReadState<T> = { kind: 'idle' | 'loading'; loadingMore: false; moreError: null; addedIds: readonly string[] } | { kind: 'settled'; result: ClientResult<ReadPage<T>>; loadingMore: boolean; moreError: ClientError | null; addedIds: readonly string[] };
export type PageRead<T> = { getSnapshot(): PageReadState<T>; subscribe(listener: () => void): () => void; start(): Promise<void>; loadMore(): Promise<void>; dispose(): void };

/** Framework-free, read-only page settlement. A scope change must create a new instance. */
export function createPageRead<T extends { id: string }>(read: (cursor: string | undefined, signal: AbortSignal) => Promise<ClientResult<ReadPage<T>>>): PageRead<T> {
  const idle: PageReadState<T> = { kind: 'idle', loadingMore: false, moreError: null, addedIds: [] };
  let snapshot: PageReadState<T> = idle;
  let controller: AbortController | undefined;
  let busy = false; let disposed = false; let generation = 0;
  const listeners = new Set<() => void>();
  const seen = new Set<string>();
  const publish = (value: PageReadState<T>) => { snapshot = value; for (const listener of listeners) listener(); };
  const load = async (cursor: string | undefined, more: boolean) => {
    if (busy || disposed) return;
    busy = true;
    const epoch = ++generation;
    controller = new AbortController();
    const prior = snapshot.kind === 'settled' && snapshot.result.ok ? snapshot.result.value : null;
    if (cursor) seen.add(cursor);
    publish(more && snapshot.kind === 'settled' ? { ...snapshot, loadingMore: true, moreError: null, addedIds: [] } : { kind: 'loading', loadingMore: false, moreError: null, addedIds: [] });
    let result: ClientResult<ReadPage<T>>;
    try { result = await read(cursor, controller.signal); }
    catch { result = { ok: false, error: { code: 'transport_failure', message: 'Read unavailable' } }; }
    if (disposed || epoch !== generation) return;
    busy = false;
    if (result.ok) {
      const ids = new Set((more ? prior?.items ?? [] : []).map(item => item.id));
      const page = result.value;
      const valid = Array.isArray(page.items) && page.items.length <= 100 && (page.nextCursor === null || (typeof page.nextCursor === 'string' && page.nextCursor.length > 0 && page.nextCursor.length <= 1000 && !seen.has(page.nextCursor))) &&
        (more ? prior?.items.length ?? 0 : 0) + page.items.length <= 1000 && page.items.every(item => {
          if (typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 200 || ids.has(item.id)) return false;
          ids.add(item.id); return true;
        });
      if (!valid) result = { ok: false, error: { code: 'invalid_response', message: 'Invalid paged response' } };
    }
    if (more && !result.ok && prior) {
      publish({ kind: 'settled', result: { ok: true, value: prior }, loadingMore: false, moreError: result.error, addedIds: [] });
    } else if (result.ok) {
      const addedIds = result.value.items.map(item => item.id);
      publish({ kind: 'settled', result: { ok: true, value: { items: [...(more ? prior?.items ?? [] : []), ...result.value.items], nextCursor: result.value.nextCursor } }, loadingMore: false, moreError: null, addedIds });
    } else publish({ kind: 'settled', result, loadingMore: false, moreError: null, addedIds: [] });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async start() { if (busy) return; disposed = false; seen.clear(); await load(undefined, false); },
    async loadMore() {
      if (disposed || busy || snapshot.kind !== 'settled' || !snapshot.result.ok || !snapshot.result.value.nextCursor) return;
      await load(snapshot.result.value.nextCursor, true);
    },
    dispose() { disposed = true; generation++; controller?.abort(); busy = false; publish(idle); },
  };
}
