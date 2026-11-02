import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Version } from '@workprint/contracts';
import { forgetOwnedImage, forgetOwnedImages, readOwnedImage } from '../../../src/api/owned-image-cache.js';

type Client = Parameters<typeof readOwnedImage>[0];
const MiB = 1024 * 1024;
const image = (id: string, byteSize = 16) => ({ id, artifactId: `artifact-${id}`, revision: 1, kind: 'image', media: { contentType: 'image/png', byteSize, width: 4, height: 3 }, createdBy: 'assistant', createdAt: '2026-11-02T00:00:00.000Z', dependencies: [] }) as unknown as Extract<Version, { kind: 'image' }>;

/** A client whose media access always answers, and a fetch that serves `size` bytes per object unless `broken`. */
function harness(sizes: Record<string, number> = {}) {
  const accessed: string[] = [], fetched: string[] = [];
  const state = { broken: false };
  const client = { media: async ({ params }: { params: { id: string } }) => {
    accessed.push(params.id);
    return { ok: true, value: { url: `http://127.0.0.1/${params.id}?X-Amz-Signature=s`, measured: { width: 4, height: 3 }, expiresAt: new Date(Date.now() + 60_000).toISOString() } };
  } } as unknown as Client;
  globalThis.fetch = (async (input: URL) => {
    const id = input.pathname.slice(1); fetched.push(id);
    if (state.broken) return new Response(null, { status: 500 });
    const size = sizes[id] ?? 16;
    return new Response(new Uint8Array(size), { headers: { 'content-type': 'image/png', 'content-length': String(size) } });
  }) as typeof fetch;
  return { client, accessed, fetched, state };
}
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

test('each version is read once and shared; a failure, a forgotten copy or an account change reads again', async () => {
  const { client, accessed, fetched, state } = harness();
  const first = await Promise.all([readOwnedImage(client, image('a')), readOwnedImage(client, image('a'))]);
  assert.ok(first.every(result => result.ok)); assert.deepEqual([accessed, fetched], [['a'], ['a']]);
  assert.ok((await readOwnedImage(client, image('a'))).ok); assert.deepEqual(fetched, ['a']);

  state.broken = true;
  assert.deepEqual(await readOwnedImage(client, image('b')), { ok: false, phase: 'error' });
  state.broken = false;
  assert.ok((await readOwnedImage(client, image('b'))).ok, 'a failure is not kept');
  assert.deepEqual(fetched, ['a', 'b', 'b']);

  forgetOwnedImage(client, 'a');
  await readOwnedImage(client, image('a'));
  forgetOwnedImages(client);
  await readOwnedImage(client, image('b'));
  assert.deepEqual(fetched, ['a', 'b', 'b', 'a', 'b']);
});

test('past 64 MiB the least recently used copy is dropped', async () => {
  const ids = ['1', '2', '3', '4', '5', '6', '7'];
  const { client, fetched } = harness(Object.fromEntries(ids.map(id => [id, 10 * MiB])));
  for (const id of ids.slice(0, 6)) await readOwnedImage(client, image(id, 10 * MiB));
  // Using 1 again makes 2 the least recently used.
  await readOwnedImage(client, image('1', 10 * MiB));
  await readOwnedImage(client, image('7', 10 * MiB));
  await new Promise(resolve => setImmediate(resolve));
  await readOwnedImage(client, image('1', 10 * MiB));
  await readOwnedImage(client, image('2', 10 * MiB));
  assert.deepEqual(fetched, [...ids, '2']);
});
