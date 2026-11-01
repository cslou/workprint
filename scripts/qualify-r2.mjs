import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Story 9: the explicit real-R2 qualification selection. Every outcome other than all PASS is NON-PASS.
const file = 'outputs/r2-development.json';
const fail = (message) => { console.error(`NON-PASS: ${message}`); process.exit(1); };
if (!existsSync(file)) fail(`real-R2 qualification is blocked; supply ${file} (Story 9 in docs/sprints/sprint-005.md).`);
for (const name of ['WORKPRINT_AUTH_FIXTURE', 'WORKPRINT_AUTH_SIGNING_FIXTURE']) if (!process.env[name]) fail(`set ${name}; qualification needs the built backend and Auth.`);
let config;
try { config = JSON.parse(readFileSync(file, 'utf8')); } catch { fail(`${file} is not valid JSON.`); }
const secrets = [config.accessKeyId, config.secretAccessKey].filter((value) => typeof value === 'string' && value.length >= 8);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
const out = `outputs/verification/sprint-005/${sha}${dirty ? '-working' : ''}/r2`;
mkdirSync(out, { recursive: true });
const env = { ...process.env, WORKPRINT_STORAGE_TARGET: 'r2', WORKPRINT_BROWSER_OUTPUT: join(out, 'browser') };
const steps = [
  ['compile', 'node', ['scripts/test.mjs', 'compile']],
  ['api', process.execPath, ['--test', '--test-concurrency=1', 'apps/api/.test-build/test/upload-image-only.security.test.js', 'apps/api/.test-build/test/reference-associations.security.test.js']],
  ['browser', 'pnpm', ['exec', 'playwright', 'test', '--config', 'scripts/browser/playwright.config.ts', '--workers=1', 'verified-upload.spec.ts', 'library-media.spec.ts']],
];
const results = [];
for (const [name, command, args] of steps) {
  const log = join(out, `${name}.log`), fd = openSync(log, 'w');
  const started = Date.now();
  const run = spawnSync(command, args, { env, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  results.push({ step: name, exit: run.status, elapsedMs: Date.now() - started, log });
  console.log(`${name}: exit=${run.status} log=${log}`);
  if (run.status !== 0) break;
}
// Redaction guard: no credential, signature or credential scope may enter any retained evidence.
const leaks = [];
const walk = (directory) => { for (const entry of readdirSync(directory)) { const path = join(directory, entry); if (statSync(path).isDirectory()) walk(path); else if (statSync(path).size <= 50 * 1024 * 1024) { const text = readFileSync(path, 'latin1'); if (secrets.some((secret) => text.includes(secret)) || /X-Amz-(Signature|Credential)=[^&\s"'[]/i.test(text)) leaks.push(relative(out, path)); } } };
walk(out);
const passed = results.length === steps.length && results.every((result) => result.exit === 0) && leaks.length === 0;
writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ sha, workingTreeDirty: dirty, target: { endpoint: 'https://<redacted-account>.r2.cloudflarestorage.com', bucket: '<redacted>' }, results, redactionLeaks: leaks, verdict: passed ? 'PASS' : 'NON-PASS' }, null, 2)}\n`);
if (leaks.length) fail(`redaction guard found private values in ${leaks.length} evidence file(s); remove them before sharing.`);
if (!passed) fail(`a qualification step failed; see ${out}/summary.json.`);
console.log(`PASS: real-R2 qualification at ${sha}; summary ${out}/summary.json`);
