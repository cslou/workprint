import { applicationResponseBytes } from '@workprint/contracts';
import type { ClientError, ClientResult } from './result.js';

export type ReadPage<T> = { items: T[]; nextCursor: string | null };
type WindowMetadata = { omittedItems?: number };
export type PageReadState<T> = ({ kind: 'idle' | 'loading'; loadingMore: false; moreError: null; addedIds: readonly string[] } | { kind: 'settled'; result: ClientResult<ReadPage<T>>; loadingMore: boolean; moreError: ClientError | null; addedIds: readonly string[] }) & WindowMetadata;
export type PageRead<T> = { getSnapshot(): PageReadState<T>; subscribe(listener: () => void): () => void; start(): Promise<void>; loadMore(): Promise<void>; returnToFirstPage(): void; dispose(): void };

/** Bounded manual navigation, including an independently bounded first-page return. */
export function createPageRead<T extends { id: string }>(read: (cursor: string | undefined, signal: AbortSignal) => Promise<ClientResult<ReadPage<T>>>): PageRead<T> {
  type Row = { item: T; bytes: number };
  const idle: PageReadState<T> = { kind: 'idle', loadingMore: false, moreError: null, addedIds: [] };
  let snapshot: PageReadState<T> = idle;
  let controller: AbortController | undefined;
  let busy = false; let disposed = false; let generation = 0; let omittedItems = 0;
  let retained: Row[] = [];
  let first: { rows: Row[]; nextCursor: string | null; bytes: number } | undefined;
  const listeners = new Set<() => void>();
  const seen = new Set<string>();
  const encoder = new TextEncoder();
  const publish = (value: PageReadState<T>) => { snapshot = value; for (const listener of listeners) listener(); };
  const settle = (nextCursor: string | null, addedIds: readonly string[]) => publish({ kind: 'settled', result: { ok: true, value: { items: retained.map(row => row.item), nextCursor } }, loadingMore: false, moreError: null, addedIds, omittedItems });
  const load = async (cursor: string | undefined, more: boolean) => {
    if (busy || disposed) return;
    busy = true;
    const epoch = ++generation;
    controller = new AbortController();
    const prior = snapshot.kind === 'settled' && snapshot.result.ok ? snapshot.result.value : null;
    if (cursor) seen.add(cursor);
    while (seen.size > 1000) seen.delete(seen.values().next().value!);
    publish(more && snapshot.kind === 'settled' ? { ...snapshot, loadingMore: true, moreError: null, addedIds: [] } : { kind: 'loading', loadingMore: false, moreError: null, addedIds: [] });
    let result: ClientResult<ReadPage<T>>;
    try { result = await read(cursor, controller.signal); }
    catch { result = { ok: false, error: { code: 'transport_failure', message: 'Read unavailable' } }; }
    if (disposed || epoch !== generation) return;
    busy = false;
    const incoming: Row[] = [];
    if (result.ok) {
      const ids = new Set((more ? prior?.items ?? [] : []).map(item => item.id));
      const page = result.value;
      let bytes = 2; let valid: boolean;
      try {
        valid = Array.isArray(page.items) && page.items.length <= 100 && (page.nextCursor === null || (typeof page.nextCursor === 'string' && page.nextCursor.length > 0 && page.nextCursor.length <= 1000 && !seen.has(page.nextCursor) && (!more || page.nextCursor !== first?.nextCursor))) && page.items.every(item => {
          if (!item || typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 200 || ids.has(item.id) || (more && first?.rows.some(row => row.item.id === item.id))) return false;
          const text = JSON.stringify(item); if (typeof text !== 'string') return false;
          const size = encoder.encode(text).byteLength;
          bytes += size + (incoming.length ? 1 : 0);
          if (bytes > applicationResponseBytes) return false;
          ids.add(item.id); incoming.push({ item, bytes: size }); return true;
        });
      } catch { valid = false; }
      if (!valid) result = { ok: false, error: { code: 'invalid_response', message: 'Invalid paged response' } };
    }
    if (more && !result.ok && prior) {
      publish({ kind: 'settled', result: { ok: true, value: prior }, loadingMore: false, moreError: result.error, addedIds: [], omittedItems });
    } else if (result.ok) {
      if (!more) first = { rows: [...incoming], nextCursor: result.value.nextCursor, bytes: 2 + Math.max(0, incoming.length - 1) + incoming.reduce((sum, row) => sum + row.bytes, 0) };
      retained = [...(more ? retained : []), ...incoming];
      let bytes = 2 + Math.max(0, retained.length - 1) + retained.reduce((sum, row) => sum + row.bytes, 0);
      while (retained.length > 1000 || bytes + (first?.bytes ?? 0) > 4 * applicationResponseBytes) {
        bytes -= retained.shift()!.bytes + (retained.length ? 1 : 0); omittedItems++;
      }
      settle(result.value.nextCursor, incoming.map(row => row.item.id));
    } else publish({ kind: 'settled', result, loadingMore: false, moreError: null, addedIds: [], omittedItems });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async start() { if (busy) return; disposed = false; seen.clear(); first = undefined; retained = []; omittedItems = 0; await load(undefined, false); },
    async loadMore() {
      if (disposed || busy || snapshot.kind !== 'settled' || !snapshot.result.ok || !snapshot.result.value.nextCursor) return;
      await load(snapshot.result.value.nextCursor, true);
    },
    returnToFirstPage() {
      if (disposed || !first) return;
      generation++; controller?.abort(); busy = false; seen.clear(); omittedItems = 0;
      retained = [...first.rows]; settle(first.nextCursor, retained.map(row => row.item.id));
    },
    dispose() { disposed = true; generation++; controller?.abort(); busy = false; retained = []; first = undefined; seen.clear(); omittedItems = 0; publish(idle); },
  };
}
