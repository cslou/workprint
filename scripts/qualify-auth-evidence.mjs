import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A real failing Playwright test must not retain a password input in its failure context.
// The private sentinel is passed through the worker environment, never source/CLI/evidence.
const directory = await mkdtemp(join(tmpdir(), 'workprint-auth-evidence-'));
const sentinel = `private-control-${randomBytes(32).toString('hex')}`;
const name = `auth-evidence-control-${randomUUID()}.spec.ts`;
const sourceFile = join('scripts/browser/tests', name);
const source = `import { test, expect } from '../material-network.js';
import { fixture, account, privateFill, origin } from '../account-fixture.js';
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test('deliberate private evidence failure', async ({ page }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    await page.goto(origin); await account(page);
    const value = process.env.WORKPRINT_EVIDENCE_PRIVATE_VALUE;
    if (!value) throw new Error('Missing private control');
    await privateFill(page.getByLabel('Password', { exact: true }), value);
    throw new Error('Deliberate private-artifact control failure');
  } finally { await f.close(); }
});
test('proxy failure cannot log a private recovery URI', async ({ page }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    const value = process.env.WORKPRINT_EVIDENCE_PRIVATE_VALUE;
    if (!value) throw new Error('Missing private control');
    await f.auth.pauseAuthUpstream();
    const response = await fetch(f.auth.url + '/auth/v1/verify?token=' + encodeURIComponent(value) + '&type=recovery', { signal: AbortSignal.timeout(5000) });
    expect([502, 503, 504]).toContain(response.status); await response.arrayBuffer();
    expect(await f.auth.proxyLogsContain(value), 'Proxy must not retain recovery URI/token').toBe(false);
    console.log('Proxy private failure-path qualification PASS');
  } finally { await f.close(); }
});
`;
const logFile = join(directory, 'control.log');
let running;
let timer;
let failure;
async function removeControl() {
  if (await readFile(sourceFile, 'utf8') !== source) throw new Error('Private control source changed; refusing removal');
  await unlink(sourceFile);
}
try {
  await writeFile(sourceFile, source, { flag: 'wx', mode: 0o600 });
  const chunks = [];
  running = spawn('pnpm', ['exec', 'playwright', 'test', '--config', 'scripts/browser/playwright.config.ts', name], {
    env: { ...process.env, WORKPRINT_BROWSER_OUTPUT: join(directory, 'artifacts'), WORKPRINT_EVIDENCE_PRIVATE_VALUE: sentinel }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.stdout.on('data', data => chunks.push(data)); running.stderr.on('data', data => chunks.push(data));
  timer = setTimeout(() => running.kill('SIGTERM'), 120000);
  const exit = await new Promise((resolve, reject) => { running.once('error', reject); running.once('exit', resolve); });
  clearTimeout(timer);
  const output = Buffer.concat(chunks).toString();
  await writeFile(logFile, output.replaceAll(sentinel, '[private control]'), { mode: 0o600 });
  const files = async path => {
    const values = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) values.push(...await files(file)); else if (entry.isFile()) values.push(file);
    }
    return values;
  };
  let unsafe = output.includes(sentinel);
  for (const file of await files(directory)) {
    const bytes = await readFile(file);
    if (bytes.includes(Buffer.from(sentinel))) {
      unsafe = true;
      // Preserve the failure evidence, never the controlled private input.
      await writeFile(file, bytes.toString().replaceAll(sentinel, '[private control]'));
    }
  }
  const result = { deliberateFailureObserved: exit === 1 && /^\s+Error: Deliberate private-artifact control failure\r?$/m.test(output), privateInputRetained: unsafe, proxyFailureSafe: /(?:^|\n)Proxy private failure-path qualification PASS\r?(?:\n|$)/.test(output) && /\b1 failed\b/.test(output) && /\b1 passed\b/.test(output) };
  await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  if (!result.deliberateFailureObserved || !result.proxyFailureSafe || unsafe) throw new Error(`Auth evidence qualification failed; sanitized evidence: ${directory}`);
  console.log(`Auth evidence qualification PASS: expected child failure, private proxy failure path safe, no private input retained. Evidence: ${directory}`);
} catch (error) { failure = error; }
finally {
  clearTimeout(timer);
  if (running && running.exitCode === null && running.signalCode === null) running.kill('SIGTERM');
  try { await removeControl(); }
  catch (error) { failure = failure ? new AggregateError([failure, error], 'Evidence qualification and owned cleanup failed', { cause: error }) : error; }
}
if (failure) throw failure;
