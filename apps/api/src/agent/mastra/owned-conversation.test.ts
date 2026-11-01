import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOwnedConversationCheck } from './owned-conversation.js';

test('ownership rejects malformed IDs before storage and types missing or failed storage', async () => {
  let calls = 0;
  const missing = createOwnedConversationCheck({ async getStore() { calls++; return undefined; } });
  for (const id of ['', '.', '..', '\u0000', 'x'.repeat(201)]) assert.deepEqual(await missing('verified-account', id), { kind: 'not_found' });
  assert.equal(calls, 0, 'Malformed IDs never reach a native query');
  assert.deepEqual(await missing('verified-account', randomUUID()), { kind: 'unavailable', reason: 'native_storage' });
  const failed = createOwnedConversationCheck({ async getStore() { throw new Error('Private native storage failure'); } });
  assert.deepEqual(await failed('verified-account', randomUUID()), { kind: 'unavailable', reason: 'native_storage' });
});
