import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abortableDelay } from '../../../src/generation/http.js';

test('a wait ends at once when its signal is already aborted, and early when it aborts', async () => {
  const started = Date.now();
  await abortableDelay(5000, AbortSignal.abort());
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 20);
  await abortableDelay(5000, stop.signal);
  assert.ok(Date.now() - started < 1000, `waited ${Date.now() - started} ms`);
});
