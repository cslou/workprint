import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { root } from './environment.js';
import { start, unusedPort } from './process.js';

type FixtureAccount = { email: string; password: string };
export type AuthFixture = { url: string; anonKey: string; servingUrl: string; accounts: FixtureAccount[] };
export type FixtureIdentity = { access_token: string; user: { id: string } };

export async function readPrivateJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('Unable to read private Auth fixture JSON; inspect it privately'); }
}

/** Read and validate the authorized target before any password-grant request. */
export async function loadAuthFixture(): Promise<AuthFixture> {
  const file = process.env.WORKPRINT_AUTH_FIXTURE;
  assert.ok(file, 'Supply WORKPRINT_AUTH_FIXTURE with authorized Supabase URL, anonKey, servingUrl and accounts');
  const config = await readPrivateJson(file) as AuthFixture;
  for (const target of [config.url, config.servingUrl]) {
    let hostname: string;
    try { hostname = new URL(target).hostname; }
    catch { throw new Error('Invalid private Auth fixture target'); }
    assert.ok(hostname === '127.0.0.1', 'Auth qualification is restricted to the authorized loopback stack');
  }
  for (const account of config.accounts) assert.ok(/@[^@]+\.invalid$/.test(account.email), 'Only synthetic accounts are permitted');
  return config;
}

export async function signInFixtureAccount(config: AuthFixture, account: FixtureAccount): Promise<FixtureIdentity> {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(account), signal: AbortSignal.timeout(3000),
  });
  assert.equal(response.status, 200, 'Authorized fixture sign-in');
  return await response.json() as FixtureIdentity;
}

/** Shared process setup only; callers retain their suite-specific assertions. */
export async function startAuthServer(entry: string, baseEnv: NodeJS.ProcessEnv, config: AuthFixture, log: string,
  options: { port?: number; env?: NodeJS.ProcessEnv } = {}) {
  const port = options.port ?? await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const server = await start(process.execPath, [entry], {
    cwd: root, env: { ...baseEnv, DATABASE_URL: config.servingUrl, SUPABASE_URL: config.url,
      SUPABASE_PUBLISHABLE_KEY: config.anonKey, PORT: String(port), ...options.env }, log,
  });
  try { await server.response(`${origin}/health`); }
  catch (error) { await server.stop(); throw error; }
  return { server, origin, port };
}
