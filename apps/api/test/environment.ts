import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { command } from './process.js';

export const root = process.cwd();
export const sentinel = 'workprint-harmless-secret-sentinel';

export async function environment() {
  const logs = await mkdtemp(join(tmpdir(), 'workprint-foundation-'));
  const networkLog = join(logs, 'network.log');
  await writeFile(networkLog, '');
  const preload = join(logs, 'network.mjs');
  const guard = join(logs, 'guard.mjs');
  await writeFile(guard, await readFile(new URL('./network-guard.js', import.meta.url), 'utf8'));
  await writeFile(preload, `import { guardNetwork } from ${JSON.stringify(pathToFileURL(guard).href)}; guardNetwork(${JSON.stringify(networkLog)});`);
  // Deliberately do not inherit private local credentials, provider config or test controls.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
    MASTRA_TELEMETRY_DISABLED: '1',
    MASTRA_OFFLINE: '1',
    MASTRA_SKIP_DOTENV: '1',
    DEFAULT_ASSISTANT_MODEL: 'unqualified/disabled',
    SUPABASE_SECRET_KEY: sentinel,
  };
  await command(process.execPath, ['--input-type=module', '-e', 'try { await fetch("https://example.invalid"); process.exitCode = 1; } catch {}'], { cwd: root, env, log: join(logs, 'guard-control.log') });
  assert.match(await readFile(networkLog, 'utf8'), /blocked non-loopback/);
  await writeFile(networkLog, '');
  return {
    env, logs,
    async noNetwork() {
      assert.equal(await readFile(networkLog, 'utf8'), '', `Unexpected network activity; see ${networkLog}`);
    },
  };
}
