import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClientError, ClientResult } from '@workprint/api-client';

type Page = { items: { id: string }[]; nextCursor: string | null };
type Snapshot = { kind: string; result?: ClientResult<Page>; loadingMore: boolean; moreError: ClientError | null; addedIds: readonly string[] };
type PageRead = { start(): Promise<void>; loadMore(): Promise<void>; dispose(): void; getSnapshot(): Snapshot; subscribe(listener: () => void): () => void };
async function create(read: (cursor: string | undefined, signal: AbortSignal) => Promise<ClientResult<Page>>): Promise<PageRead> {
  const module = await import('@workprint/api-client') as unknown as { createPageRead(load: typeof read): PageRead };
  return module.createPageRead(read);
}
const page = (id: string, nextCursor: string | null): ClientResult<Page> => ({ ok: true, value: { items: [{ id }], nextCursor } });

test('paged consumers append only on activation, expose newly added IDs and never auto-fetch', async () => {
  const calls: (string | undefined)[] = [];
  const read = await create(async cursor => { calls.push(cursor); return page(cursor ?? 'first', cursor ? null : 'second'); });
  assert.deepEqual(calls, []);
  await read.start(); assert.deepEqual(calls, [undefined]);
  await read.loadMore(); assert.deepEqual(calls, [undefined, 'second']);
  assert.deepEqual(read.getSnapshot().result, { ok: true, value: { items: [{ id: 'first' }, { id: 'second' }], nextCursor: null } });
  assert.deepEqual(read.getSnapshot().addedIds, ['second']);
  await read.loadMore(); assert.equal(calls.length, 2);
  read.dispose();
});

test('page failures retain stored rows and the cursor, with one deliberate retry and no duplicate activation', async () => {
  let calls = 0; let release!: (result: ClientResult<Page>) => void;
  const read = await create(async cursor => { calls++; return !cursor ? page('first', 'next') : calls === 2 ? { ok: false, error: { code: 'transport_failure', message: 'Controlled failure' } } : await new Promise<ClientResult<Page>>(resolve => { release = resolve; }); });
  await read.start(); await read.loadMore();
  assert.equal(read.getSnapshot().moreError?.code, 'transport_failure');
  assert.deepEqual(read.getSnapshot().result, page('first', 'next'));
  const pending = read.loadMore(); await read.loadMore(); assert.equal(calls, 3);
  assert.equal(read.getSnapshot().loadingMore, true);
  release(page('last', null)); await pending;
  assert.equal(read.getSnapshot().moreError, null); assert.equal(read.getSnapshot().loadingMore, false);
  read.dispose();
});

test('duplicate IDs, repeated cursors and oversized pages fail closed without replacing loaded content', async () => {
  for (const response of [page('first', null), page('second', 'next'), { ok: true as const, value: { items: Array.from({ length: 101 }, (_, i) => ({ id: String(i) })), nextCursor: null } }]) {
    const read = await create(async cursor => cursor ? response : page('first', 'next'));
    await read.start(); await read.loadMore();
    assert.equal(read.getSnapshot().moreError?.code, 'invalid_response');
    assert.deepEqual(read.getSnapshot().result, page('first', 'next'));
    read.dispose();
  }
});

test('disposing a scoped read aborts it, discards late completion and prevents action replay', async () => {
  let release!: (result: ClientResult<Page>) => void; let signal!: AbortSignal; let calls = 0;
  const read = await create(async (_cursor, supplied) => { signal = supplied; calls++; return await new Promise<ClientResult<Page>>(resolve => { release = resolve; }); });
  const pending = read.start(); read.dispose();
  assert.equal(signal.aborted, true);
  release(page('late-owner-data', null)); await pending;
  assert.equal(read.getSnapshot().kind, 'idle');
  await read.loadMore(); assert.equal(calls, 1);
});
