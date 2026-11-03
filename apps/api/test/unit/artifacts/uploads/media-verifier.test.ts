import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyWhenFree } from '../../../../src/artifacts/uploads/media-verifier.js';
import type { MediaVerifier, VerifiedMedia } from '../../../../src/artifacts/uploads/types.js';
import { MediaProcessError } from '../../../../src/storage/index.js';

const checked: VerifiedMedia = { kind: 'image', contentType: 'image/png', byteSize: 1, width: 1, height: 1 };
const input = { kind: 'image' as const, bytes: new Uint8Array([1]), contentType: 'image/png' };

test('a media check gets its own limit on each try, joined to the caller\'s signal', async () => {
  const seen: AbortSignal[] = [];
  let tries = 0;
  const verify: MediaVerifier = async ({ signal }) => { seen.push(signal!); tries += 1; if (tries === 1) throw new MediaProcessError('capacity'); return checked; };
  // No caller signal: each try still has a limit of its own, a new one after a busy turn.
  assert.equal(await verifyWhenFree(verify, input, { waitMs: 1000, retryMs: 1 }), checked);
  assert.equal(seen.length, 2);
  assert.ok(seen.every(signal => signal instanceof AbortSignal && !signal.aborted));
  assert.notEqual(seen[0], seen[1]);
  // A caller signal: the try's signal is not the caller's own, and stops when the caller stops.
  const stop = new AbortController();
  seen.length = 0; tries = 1;
  await verifyWhenFree(verify, input, { waitMs: 1000, retryMs: 1, signal: stop.signal });
  assert.notEqual(seen[0], stop.signal);
  stop.abort();
  assert.equal(seen[0]!.aborted, true);
});
