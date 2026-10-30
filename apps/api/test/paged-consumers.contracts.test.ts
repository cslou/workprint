import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClientError, ClientResult } from '@workprint/api-client';

type Page = { items: { id: string; text?: string }[]; nextCursor: string | null };
type Snapshot = { kind: string; result?: ClientResult<Page>; loadingMore: boolean; moreError: ClientError | null; addedIds: readonly string[]; omittedItems?: number };
type PageRead = { start(): Promise<void>; loadMore(): Promise<void>; returnToFirstPage(): void; dispose(): void; getSnapshot(): Snapshot; subscribe(listener: () => void): () => void };
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

test('bounded windows remain navigable beyond item 1000 and return to the first page', async () => {
  const observed = new Set<string>();
  const read = await create(async cursor => {
    const start = Number(cursor ?? 0), end = Math.min(start + 100, 1105);
    return { ok: true, value: { items: Array.from({ length: end - start }, (_, index) => ({ id: String(start + index) })), nextCursor: end < 1105 ? String(end) : null } };
  });
  await read.start();
  for (let page = 0; page < 12; page++) {
    const state = read.getSnapshot(); assert.equal(state.moreError, null, 'A bounded view must not strand the 1001st record');
    assert.ok(state.result?.ok); assert.ok(state.result.value.items.length <= 1000);
    state.addedIds.forEach(id => observed.add(id));
    if (state.result.value.nextCursor === null) break;
    await read.loadMore();
  }
  assert.equal(observed.size, 1105); assert.ok((read.getSnapshot().omittedItems ?? 0) > 0);
  read.returnToFirstPage(); const restarted = read.getSnapshot(); assert.ok(restarted.result?.ok); assert.equal(restarted.result.value.items[0]?.id, '0'); assert.equal(restarted.omittedItems ?? 0, 0);
  read.dispose();
});

test('the retained window is byte bounded without blocking valid large records', async () => {
  const observed = new Set<string>();
  const read = await create(async cursor => {
    const start = Number(cursor ?? 0), end = start + 4;
    return { ok: true, value: { items: Array.from({ length: 4 }, (_, index) => ({ id: String(start + index), text: 'x'.repeat(200000) })), nextCursor: end < 24 ? String(end) : null } };
  });
  await read.start();
  const first = read.getSnapshot(); assert.ok(first.result?.ok);
  const firstBytes = Buffer.byteLength(JSON.stringify(first.result.value.items));
  for (let page = 0; page < 6; page++) {
    const state = read.getSnapshot(); assert.equal(state.moreError, null); assert.ok(state.result?.ok);
    assert.ok(Buffer.byteLength(JSON.stringify(state.result.value.items)) + firstBytes <= 4 * 1024 * 1024, 'Retained content must stay within four MiB');
    state.addedIds.forEach(id => observed.add(id));
    if (state.result.value.nextCursor === null) break;
    await read.loadMore();
  }
  assert.equal(observed.size, 24); assert.ok((read.getSnapshot().omittedItems ?? 0) > 0); read.dispose();
});

test('first-page return aborts pending work, settles without a fetch and cannot revive after disposal', async () => {
  let calls = 0; let release!: (result: ClientResult<Page>) => void; let signal!: AbortSignal;
  const read = await create(async (cursor, supplied) => {
    calls++;
    if (cursor === '1000') { signal = supplied; return await new Promise<ClientResult<Page>>(resolve => { release = resolve; }); }
    const start = Number(cursor ?? 0), end = start + 100;
    return { ok: true, value: { items: Array.from({ length: 100 }, (_, i) => ({ id: String(start + i) })), nextCursor: String(end) } };
  });
  await read.start(); for (let i = 0; i < 9; i++) await read.loadMore();
  const pending = read.loadMore(); const before = calls; read.returnToFirstPage();
  assert.equal(signal.aborted, true); assert.equal(calls, before);
  assert.deepEqual(read.getSnapshot().addedIds, Array.from({ length: 100 }, (_, i) => String(i)));
  release(page('late-window-data', null)); await pending;
  assert.equal(read.getSnapshot().loadingMore, false); assert.equal(read.getSnapshot().omittedItems, 0);
  const current = read.getSnapshot(); assert.ok(current.result?.ok); assert.equal(current.result.value.items.length, 100);
  read.dispose(); read.returnToFirstPage(); assert.equal(read.getSnapshot().kind, 'idle'); assert.equal(calls, before);
});
