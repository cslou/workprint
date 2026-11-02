// Meta image check through the app's own client. Dry by default: a loopback fake Meta, a placeholder
// key and no network. `--live` makes ONE real, paid `muse-image-1.0` generation (about $0.01) from
// a prompt only, and saves the sanitized response shape. Never run by a gate: only on request.
// Run through `pnpm live:image [--live]`, which compiles the tests first.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const live = process.argv.includes('--live');
const build = join(import.meta.dirname, '../../apps/api/.test-build');
const load = path => import(pathToFileURL(join(build, path)).href);
const { createMetaImageClient, metaImageBaseUrl } = await load('src/generation/index.js');
const { metaImageFake } = await load('test/support/meta-image-fake.js');

/** The key comes only from the root .env; it is never printed or put in process.env. */
function metaKey() {
  const key = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')).META_API_KEY : undefined;
  if (!key) throw new Error('live:image --live needs META_API_KEY in the root .env');
  return key;
}

/** Response shape with every base64 image replaced by its length. */
const shapeOf = value => Array.isArray(value) ? value.map(shapeOf)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === 'b64_json' && typeof item === 'string' ? `<base64 ${item.length} chars>` : shapeOf(item)]))
  : value;

const fake = live ? undefined : await metaImageFake();
let observed;
/** Records the raw response's shape and safe headers, then hands the response to the client unchanged. */
const recordingFetch = async (url, init) => {
  const response = await globalThis.fetch(url, init);
  const text = await response.clone().text();
  let body;
  try { body = shapeOf(JSON.parse(text)); } catch { body = `<${text.length} characters, not JSON>`; }
  const headers = Object.fromEntries([...response.headers].filter(([name]) => /^(content-type|x-request-id|x-ratelimit-[\w-]+)$/.test(name)));
  observed = { status: response.status, headers, body };
  return response;
};

const request = { prompt: 'A quiet gallery bench in soft daylight, a framed landscape painting on the wall behind it. Natural colour, no people.', size: '1536x1024', outputFormat: 'png' };
let pass = true, reason, image;
try {
  const client = createMetaImageClient({ apiKey: live ? metaKey() : 'placeholder-meta-key', baseUrl: live ? metaImageBaseUrl : fake.url, fetch: recordingFetch });
  const started = Date.now();
  const result = await client.generate(request);
  assert.ok(result.images.length >= 1, 'no image returned');
  const bytes = Buffer.from(result.images[0].bytes);
  assert.equal(result.images[0].contentType, 'image/png');
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'not a PNG');
  image = { bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), seconds: (Date.now() - started) / 1000, requestId: result.requestId };
} catch (error) {
  pass = false;
  reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
} finally {
  await fake?.close();
}
if (live && observed) {
  const directory = 'outputs/verification';
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `muse-image-live-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify({ request: { model: 'muse-image-1.0', ...request }, ...observed, image }, null, 2) + '\n');
}
console.info(JSON.stringify({ mode: live ? 'live' : 'dry', pass, ...(reason ? { reason } : {}), ...(image ? { image } : {}) }, null, 2));
if (!pass) process.exitCode = 1;
