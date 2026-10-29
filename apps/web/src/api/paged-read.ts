import type { ClientResult } from '@workprint/api-client';

type Page<T> = { items: readonly T[]; nextCursor: string | null };
/** Read-only collection policy; operation adapters retain transport and error context. */
export async function collectPages<T extends { id: string }>(
  fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<ClientResult<Page<T>>>,
  signal: AbortSignal,
  context: { duplicate: string; repeatedCursor: string },
): Promise<ClientResult<T[]>> {
  const items: T[] = [], ids = new Set<string>(), cursors = new Set<string>();
  let cursor: string | undefined;
  while (!signal.aborted) {
    const result = await fetchPage(cursor, signal);
    if (signal.aborted) break;
    if (!result.ok) return result;
    for (const item of result.value.items) {
      if (ids.has(item.id)) return { ok: false, error: { code: 'invalid_response', message: context.duplicate } };
      ids.add(item.id); items.push(item);
    }
    const next = result.value.nextCursor;
    if (next === null) return { ok: true, value: items };
    if (cursors.has(next)) return { ok: false, error: { code: 'invalid_response', message: context.repeatedCursor } };
    cursors.add(next); cursor = next;
  }
  return { ok: false, error: { code: 'cancelled', message: 'Read cancelled' } };
}
