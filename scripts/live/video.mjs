// MiniMax video check through the app's own client. Dry by default: a loopback fake MiniMax, a
// placeholder key and no network. `--live` makes ONE real, paid MiniMax-H3 768P 5 s prompt-only
// generation (about $0.40), polls it, downloads the clip, probes and decodes it with the pinned
// toolchain, and saves the sanitized shapes, the clip and its probe. `--references <png>…` (Sprint
// 012) sends those 1 to 9 PNGs as reference images instead, at 16:9 for 6 s; dry, with no paths, it
// uses three generated sample PNGs (1376x768, 1024x1024, 768x1376), and it checks the fake got each one
// as a reference_image in order. A paid run always needs real paths. Never run by a gate: only on request. Run through
// `pnpm live:video [--live] [--references <png>…]`, which compiles the tests; only `--live` starts
// the shared test stack, for the pinned toolchain.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const live = process.argv.includes('--live');
/** The PNG paths after `--references`, up to the next option. */
const referencePaths = (() => {
  const at = process.argv.indexOf('--references');
  if (at < 0) return undefined;
  const after = process.argv.slice(at + 1), end = after.findIndex(arg => arg.startsWith('--'));
  return end < 0 ? after : after.slice(0, end);
})();
// A paid run never sends the generated samples: it stops before the stack starts.
assert.ok(!live || !referencePaths || referencePaths.length, 'live:video --live --references needs the PNG paths; samples are for the dry run only');
if (live && !process.env.WORKPRINT_TEST_STACK) {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, '../test-stack.mjs'), process.execPath, import.meta.filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
const build = join(import.meta.dirname, '../../apps/api/.test-build');
const load = path => import(pathToFileURL(join(build, path)).href);
const { createMiniMaxVideoClient, createSafeDownload, MiniMaxVideoError, miniMaxVideoBaseUrl } = await load('src/generation/index.js');
const { createMediaSandbox } = await load('src/storage/index.js');
const { miniMaxVideoFake } = await load('test/support/minimax-video-fake.js');
const { testPng } = await load('test/support/meta-image-fake.js');
const { testStack } = await load('test/support/test-stack.js');

/** The key comes only from the root .env; it is never printed or put in process.env. */
function miniMaxKey() {
  const key = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')).MINIMAX_API_KEY : undefined;
  if (!key) throw new Error('live:video --live needs MINIMAX_API_KEY in the root .env');
  return key;
}

/** Response shape with result URLs removed; the task id is kept for support. */
const shapeOf = value => Array.isArray(value) ? value.map(shapeOf)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === 'url' && typeof item === 'string' ? `<url removed, ${item.length} chars>` : shapeOf(item)]))
  : value;

const fake = live ? undefined : await miniMaxVideoFake();
const observed = { create: undefined, queries: [] };
/** Records each raw response's shape and safe headers, then hands the response to the client unchanged. */
const recordingFetch = async (url, init) => {
  const response = await globalThis.fetch(url, init);
  const text = await response.clone().text();
  let body;
  try { body = shapeOf(JSON.parse(text)); } catch { body = `<${text.length} characters, not JSON>`; }
  const headers = Object.fromEntries([...response.headers].filter(([name]) => /^(content-type|trace-id|x-request-id|x-ratelimit-[\w-]+)$/.test(name)));
  const entry = { status: response.status, headers, body };
  if (init?.method === 'POST') observed.create = entry; else observed.queries.push(entry);
  return response;
};

/** A PNG as a reference image: its data URL and the size from its header. */
function pngReference(bytes, file) {
  assert.ok(bytes.subarray(1, 4).toString('latin1') === 'PNG', `${file} is not a PNG`);
  return { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), file, bytes: bytes.byteLength };
}
const samples = [[1376, 768], [1024, 1024], [768, 1376]];
const references = !referencePaths ? undefined : referencePaths.length ? referencePaths.map(path => pngReference(readFileSync(path), path))
  : samples.map(([width, height], index) => pngReference(Buffer.from(testPng({ width, height, seed: 40 + index })), `sample ${width}x${height}`));
const request = references
  ? { prompt: `${references.map((image, index) => `Image ${index + 1} is a reference for the subjects, setting and framing.`).join(' ')} A slow push-in as the scene settles. Natural colour, gentle camera movement.`,
    durationS: 6, ratio: '16:9', referenceImages: references.map(({ dataUrl, width, height }) => ({ dataUrl, width, height })) }
  : { prompt: 'A slow push-in on a quiet gallery bench in soft daylight, a framed landscape painting on the wall behind it. Natural colour, no people, gentle camera movement.', durationS: 5, ratio: '16:9' };
/** The request as recorded: each reference image by its file and size, never its data. */
const recorded = { ...request, ...(references ? { referenceImages: references.map(({ file, width, height, bytes }) => ({ file, width, height, bytes })) } : {}) };
const directory = references ? 'outputs/verification/sprint-012' : 'outputs/verification/sprint-009';
const pollMs = live ? 10_000 : 10, deadlineMs = 15 * 60_000;
let pass = true, reason, clip, task, probe, taskId;
try {
  const client = createMiniMaxVideoClient({ apiKey: live ? miniMaxKey() : 'placeholder-minimax-key', baseUrl: live ? miniMaxVideoBaseUrl : fake.url, fetch: recordingFetch, ...(live ? {} : { download: createSafeDownload({ allowLoopback: true }) }) });
  const started = Date.now();
  ({ taskId } = await client.submit(request));
  if (fake && references) {
    // The fake got the text, then each image as a reference in order, with the ratio.
    const sent = fake.requests.find(item => item.method === 'POST').body;
    assert.deepEqual([sent.ratio, sent.content.map(item => item.role ?? item.type)], ['16:9', ['text', ...references.map(() => 'reference_image')]]);
    assert.deepEqual(sent.content.slice(1).map(item => item.image_url.url), references.map(image => image.dataUrl));
  }
  for (;;) {
    // A paid task is never abandoned for a passing query error; only the deadline ends the wait.
    try { task = await client.query(taskId); } catch (error) {
      if (!(error instanceof MiniMaxVideoError) || !['unavailable', 'rate_limited'].includes(error.code)) throw error;
      task = { status: 'unknown' };
    }
    if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') break;
    assert.ok(Date.now() - started < deadlineMs, `task ${taskId} still ${task.status} after 15 minutes`);
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  assert.equal(task.status, 'succeeded', `task ${taskId} ended ${task.status}`);
  const bytes = await client.download(task.result.url);
  clip = { taskId, bytes: bytes.byteLength, seconds: (Date.now() - started) / 1000, reportedDurationS: task.result.durationS, resolution: task.result.resolution };
  if (live) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `minimax-video-live-${taskId}.mp4`), bytes, { mode: 0o600 });
    // The pinned toolchain's view of the clip, and how long a full check would take.
    const sandbox = await createMediaSandbox(testStack().media.toolchain);
    try {
      probe = await sandbox.use(bytes, async session => {
        const at = Date.now();
        const streams = JSON.parse((await session.probe()).toString('utf8'));
        const probed = Date.now();
        await session.decode();
        const decoded = Date.now();
        return { streams, probeMs: probed - at, decodeMs: decoded - probed };
      });
    } finally { await sandbox.close(); }
  }
} catch (error) {
  pass = false;
  reason = `${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}${taskId ? ` (task ${taskId})` : ''}`;
} finally {
  await fake?.close();
}
if (live && (observed.create || observed.queries.length)) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `minimax-video-live-${new Date().toISOString().slice(0, 10)}.json`);
  const queries = observed.queries.length > 3 ? [observed.queries[0], `<${observed.queries.length - 2} more queries>`, observed.queries.at(-1)] : observed.queries;
  writeFileSync(file, JSON.stringify({ request: { model: 'MiniMax-H3', resolution: '768P', ...recorded }, create: observed.create, queries, clip, probe }, null, 2) + '\n');
}
console.info(JSON.stringify({ mode: live ? 'live' : 'dry', pass, ...(references ? { references: recorded.referenceImages } : {}), ...(reason ? { reason } : {}), ...(clip ? { clip } : {}), ...(probe ? { probeMs: probe.probeMs, decodeMs: probe.decodeMs } : {}) }, null, 2));
if (!pass) process.exitCode = 1;
