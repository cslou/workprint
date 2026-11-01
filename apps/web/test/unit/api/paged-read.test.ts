import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectPages } from '../../../src/api/paged-read.js';

test('paged reads preserve cursors, failures and validation context', async () => {
  const noun = 'export';
  const signal = new AbortController().signal;
  const context = { duplicate: `Duplicate ${noun}`, repeatedCursor: `Repeated ${noun} cursor` };
  const seen: (string | undefined)[] = [];
  const result = await collectPages(async (cursor, supplied) => {
    assert.equal(supplied, signal); seen.push(cursor);
    return { ok: true, value: { items: [{ id: cursor ?? 'first' }], nextCursor: cursor ? null : 'second' } };
  }, signal, context);
  assert.deepEqual(seen, [undefined, 'second']); assert.deepEqual(result, { ok: true, value: [{ id: 'first' }, { id: 'second' }] });
  assert.deepEqual(await collectPages(async cursor => ({ ok: true, value: { items: [{ id: 'duplicate' }], nextCursor: cursor ? null : 'next' } }), signal, context), { ok: false, error: { code: 'invalid_response', message: context.duplicate } });
  let repeatedCalls = 0;
  assert.deepEqual(await collectPages(async () => ({ ok: true, value: { items: [], nextCursor: ++repeatedCalls > 2 ? null : 'same' } }), signal, context), { ok: false, error: { code: 'invalid_response', message: context.repeatedCursor } });
  assert.equal(repeatedCalls, 2);
  const failure = { ok: false as const, error: { code: 'unauthenticated' as const, message: 'Read requires admission' } };
  assert.equal(await collectPages(async () => failure, signal, context), failure);
});

test('paged read cancellation discards partial results and never fetches another page', async () => {
  const controller = new AbortController(); let calls = 0;
  const read = () => collectPages(async () => { calls++; controller.abort(); return { ok: true, value: { items: [{ id: 'discarded' }], nextCursor: 'must-not-fetch' } }; }, controller.signal, { duplicate: 'Duplicate item', repeatedCursor: 'Repeated cursor' });
  assert.deepEqual(await read(), { ok: false, error: { code: 'cancelled', message: 'Read cancelled' } });
  assert.equal(calls, 1);
  assert.deepEqual(await read(), { ok: false, error: { code: 'cancelled', message: 'Read cancelled' } });
  assert.equal(calls, 1);
});
