// MiniMax video check through the app's own client. Dry by default: a loopback fake MiniMax, a
// placeholder key and no network. `--live` makes ONE real, paid MiniMax-H3 768P 5 s prompt-only
// generation (about $0.40), polls it, downloads the clip, probes and decodes it with the pinned
// toolchain, and saves the sanitized shapes, the clip and its probe. Never run by a gate: only on
// request. Run through `pnpm live:video [--live]`, which compiles the tests; only `--live` starts the
// shared test stack, for the pinned toolchain.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const live = process.argv.includes('--live');
if (live && !process.env.WORKPRINT_TEST_STACK) {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, '../test-stack.mjs'), process.execPath, import.meta.filename, '--live'], { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
const build = join(import.meta.dirname, '../../apps/api/.test-build');
const load = path => import(pathToFileURL(join(build, path)).href);
const { createMiniMaxVideoClient, createSafeDownload, MiniMaxVideoError, miniMaxVideoBaseUrl } = await load('src/generation/index.js');
const { createMediaSandbox } = await load('src/storage/index.js');
const { miniMaxVideoFake } = await load('test/support/minimax-video-fake.js');
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

const request = { prompt: 'A slow push-in on a quiet gallery bench in soft daylight, a framed landscape painting on the wall behind it. Natural colour, no people, gentle camera movement.', durationS: 5, ratio: '16:9' };
const pollMs = live ? 10_000 : 10, deadlineMs = 15 * 60_000;
let pass = true, reason, clip, task, probe, taskId;
try {
  const client = createMiniMaxVideoClient({ apiKey: live ? miniMaxKey() : 'placeholder-minimax-key', baseUrl: live ? miniMaxVideoBaseUrl : fake.url, fetch: recordingFetch, ...(live ? {} : { download: createSafeDownload({ allowLoopback: true }) }) });
  const started = Date.now();
  ({ taskId } = await client.submit(request));
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
    const directory = 'outputs/verification/sprint-009';
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
  const directory = 'outputs/verification/sprint-009';
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `minimax-video-live-${new Date().toISOString().slice(0, 10)}.json`);
  const queries = observed.queries.length > 3 ? [observed.queries[0], `<${observed.queries.length - 2} more queries>`, observed.queries.at(-1)] : observed.queries;
  writeFileSync(file, JSON.stringify({ request: { model: 'MiniMax-H3', resolution: '768P', ...request }, create: observed.create, queries, clip, probe }, null, 2) + '\n');
}
console.info(JSON.stringify({ mode: live ? 'live' : 'dry', pass, ...(reason ? { reason } : {}), ...(clip ? { clip } : {}), ...(probe ? { probeMs: probe.probeMs, decodeMs: probe.decodeMs } : {}) }, null, 2));
if (!pass) process.exitCode = 1;
