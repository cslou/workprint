import { expect, test } from '../material-network.js';
import { collectPages } from '../../../apps/web/src/api/paged-read.js';

for (const noun of ['export', 'generation request']) test(`paged ${noun} reads preserve cursors, failures and validation context`, async () => {
  const signal = new AbortController().signal;
  const context = { duplicate: `Duplicate ${noun}`, repeatedCursor: `Repeated ${noun} cursor` };
  const seen: (string | undefined)[] = [];
  const result = await collectPages(async (cursor, supplied) => {
    expect(supplied).toBe(signal); seen.push(cursor);
    return { ok: true, value: { items: [{ id: cursor ?? 'first' }], nextCursor: cursor ? null : 'second' } };
  }, signal, context);
  expect(seen).toEqual([undefined, 'second']); expect(result).toEqual({ ok: true, value: [{ id: 'first' }, { id: 'second' }] });
  expect(await collectPages(async cursor => ({ ok: true, value: { items: [{ id: 'duplicate' }], nextCursor: cursor ? null : 'next' } }), signal, context)).toEqual({ ok: false, error: { code: 'invalid_response', message: context.duplicate } });
  let repeatedCalls = 0;
  expect(await collectPages(async () => ({ ok: true, value: { items: [], nextCursor: ++repeatedCalls > 2 ? null : 'same' } }), signal, context)).toEqual({ ok: false, error: { code: 'invalid_response', message: context.repeatedCursor } });
  expect(repeatedCalls).toBe(2);
  const failure = { ok: false as const, error: { code: 'unauthenticated' as const, message: 'Read requires admission' } };
  expect(await collectPages(async () => failure, signal, context)).toBe(failure);
});

test('paged read cancellation discards partial results and never fetches another page', async () => {
  const controller = new AbortController(); let calls = 0;
  const read = () => collectPages(async () => { calls++; controller.abort(); return { ok: true, value: { items: [{ id: 'discarded' }], nextCursor: 'must-not-fetch' } }; }, controller.signal, { duplicate: 'Duplicate item', repeatedCursor: 'Repeated cursor' });
  expect(await read()).toEqual({ ok: false, error: { code: 'cancelled', message: 'Read cancelled' } });
  expect(calls).toBe(1);
  expect(await read()).toEqual({ ok: false, error: { code: 'cancelled', message: 'Read cancelled' } });
  expect(calls).toBe(1);
});
