import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { command } from './process.js';

export const root = process.cwd();
export const sentinel = 'workprint-harmless-secret-sentinel';
/** Stands in for the Meta key in every test process; the network guard keeps it off the network. */
export const placeholderMetaKey = 'workprint-placeholder-meta-key';
/** Stands in for the MiniMax key in test compositions that reach the loopback MiniMax fake. */
export const placeholderMiniMaxKey = 'workprint-placeholder-minimax-key';

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
    // The real model name: tests swap the provider, never switch chat off.
    DEFAULT_ASSISTANT_MODEL: 'meta/muse-spark-1.3',
    META_API_KEY: placeholderMetaKey,
    SUPABASE_SECRET_KEY: sentinel,
    // Health-only fixtures never call Auth. Protected admission has its own real target.
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_PUBLISHABLE_KEY: 'unused-health-only-key',
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

export type TestEnvironment = Awaited<ReturnType<typeof environment>>;

/**
 * Unguarded environment for `pnpm live:chat --live` only: the same allowlist as `environment()`, but the
 * real Meta key and no network guard. Never used by the default suites.
 */
export async function liveEnvironment(metaApiKey: string, model = 'meta/muse-spark-1.3'): Promise<TestEnvironment> {
  const guarded = await environment();
  const env: NodeJS.ProcessEnv = { ...guarded.env, META_API_KEY: metaApiKey, DEFAULT_ASSISTANT_MODEL: model };
  delete env.NODE_OPTIONS;
  return { env, logs: guarded.logs, async noNetwork() { /* live calls are the point */ } };
}

