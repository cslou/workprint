import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const exec = promisify(execFile);
const projectId = 'workprint-sprint001';
const root = process.cwd();
const privateFile = join(root, 'outputs/local-supabase.setup.json');
const servingFile = join(root, 'outputs/local-supabase.env');
const ownerFile = join(root, 'outputs/local-supabase.owner.json');
const excluded = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
let setupPhase = 'prerequisite and target checks';
export interface LocalSupabase {
  projectId: string;
  url: string;
  anonKey: string;
  secretKey: string;
  setupUrl: string;
  servingUrl: string;
  accounts: { email: string; password: string }[];
}

export async function localSupabase(): Promise<LocalSupabase> {
  if (!existsSync(privateFile)) throw new Error('Local Supabase prerequisites missing; run pnpm local:prepare');
  const config = JSON.parse(await readFile(privateFile, 'utf8')) as LocalSupabase;
  const api = new URL(config.url);
  if (config.projectId !== projectId || api.hostname !== '127.0.0.1' || api.port !== '55431' || api.protocol !== 'http:' || config.accounts.length !== 2) {
    throw new Error('Refusing ambiguous local Supabase target');
  }
  for (const [url, username] of [[config.setupUrl, 'workprint_setup'], [config.servingUrl, 'workprint_serving']]) {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55432' || target.pathname !== '/postgres' || target.username !== username || !/^[a-f0-9]{48}$/.test(target.password)) throw new Error('Invalid local role target');
  }
  return config;
}

async function sql(url: string, statement: string) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  try { await client.connect(); return await client.query(statement); } finally { await client.end(); }
}

async function prepareLocal() {
  await mkdir('outputs', { recursive: true });
  const version = (await exec('supabase', ['--version'], { timeout: 10000 })).stdout.trim();
  if (version !== '2.84.2') throw new Error('Local Supabase setup requires qualified CLI 2.84.2; no global upgrade is performed');
  const configText = await readFile('supabase/config.toml', 'utf8');
  if (!configText.includes(`project_id = "${projectId}"`)) throw new Error('Unexpected Supabase project identity');
  const containers = (await exec('docker', ['ps', '-a', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.ID}}'], { timeout: 10000 })).stdout.trim();
  if (existsSync(ownerFile)) {
    const owner = JSON.parse(await readFile(ownerFile, 'utf8')) as { projectId?: string; root?: string };
    if (owner.projectId !== projectId || (owner.root && owner.root !== await realpath(root))) throw new Error('Local stack ownership mismatch');
  } else {
    if (containers) throw new Error('Refusing to adopt an existing unrecorded Supabase stack');
    for (const port of [55431, 55432, 55435]) {
      const server = createServer();
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await writeFile(ownerFile, JSON.stringify({ version: 1, projectId, root: await realpath(root) }), { flag: 'wx', mode: 0o600 });
  }
  const cliLog = join(root, 'outputs/local-supabase-cli.log');
  try {
    setupPhase = 'owned local stack startup';
    await exec('supabase', ['start', '--agent', 'no', '--workdir', root, '--exclude', excluded], {
      env: { ...process.env, DO_NOT_TRACK: '1' }, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    });
    await writeFile(cliLog, 'Owned local stack startup succeeded; credential-bearing CLI output was not logged.\n', { mode: 0o600 });
  } catch {
    throw new Error('Workprint local Supabase start failed; inspect only its recorded project resources, never reset another stack');
  }
  setupPhase = 'local CLI status capture';
  const status = JSON.parse((await exec('supabase', ['status', '--agent', 'no', '--workdir', root, '--output', 'json'], {
    env: { ...process.env, DO_NOT_TRACK: '1' }, timeout: 20000,
  })).stdout) as Record<string, string>;
  for (const name of ['API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) if (!status[name]) throw new Error(`Missing CLI status field: ${name}`);
  const target = new URL(status.DB_URL!);
  const api = new URL(status.API_URL!);
  if (target.hostname !== '127.0.0.1' || target.port !== '55432' || target.pathname !== '/postgres' || api.hostname !== '127.0.0.1' || api.port !== '55431' || api.protocol !== 'http:') throw new Error('CLI returned an unexpected local target');
  let saved: LocalSupabase;
  if (existsSync(privateFile)) {
    saved = await localSupabase();
    if (saved.url !== status.API_URL || saved.secretKey !== status.SERVICE_ROLE_KEY) throw new Error('Existing private config differs; preserve it and inspect the owned local target');
  } else {
    if (existsSync(servingFile)) throw new Error('Refusing to overwrite an unrelated serving environment file');
    const setup = new URL(target);
    setup.username = 'workprint_setup'; setup.password = randomBytes(24).toString('hex');
    const serving = new URL(target);
    serving.username = 'workprint_serving'; serving.password = randomBytes(24).toString('hex');
    saved = {
      projectId, url: status.API_URL!, anonKey: status.ANON_KEY!, secretKey: status.SERVICE_ROLE_KEY!,
      setupUrl: setup.href, servingUrl: serving.href,
      accounts: ['a', 'b'].map((id) => ({ email: `workprint-s001-${id}@workprint.invalid`, password: randomBytes(24).toString('hex') })),
    };
    // Save generated credentials before any account/role effect so a partial setup can resume without rotation.
    await writeFile(privateFile, JSON.stringify(saved), { flag: 'wx', mode: 0o600 });
  }
  setupPhase = 'local role bootstrap';
  for (const url of [saved.setupUrl, saved.servingUrl]) {
    const role = new URL(url);
    const exists = await sql(target.href, `SELECT 1 FROM pg_roles WHERE rolname = '${role.username}'`);
    if (!exists.rowCount) await sql(target.href, `CREATE ROLE ${role.username} LOGIN PASSWORD '${role.password}'`);
    await sql(url, 'SELECT 1');
  }
  await sql(target.href, 'GRANT CREATE ON DATABASE postgres TO workprint_setup');
  setupPhase = 'synthetic local account provisioning and verification';
  const admin = createClient(saved.url, saved.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = await admin.auth.admin.listUsers();
  if (users.error) throw new Error('Unable to list Workprint-local setup identities');
  for (const account of saved.accounts) {
    if (!users.data.users.some((user) => user.email === account.email)) {
      const created = await admin.auth.admin.createUser({ ...account, email_confirm: true });
      if (created.error) throw new Error('Unable to create synthetic local setup identity');
    }
    const client = createClient(saved.url, saved.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword(account);
    if (signedIn.error || !signedIn.data.session) throw new Error('Synthetic local identity does not match saved private credentials');
    const verified = await admin.auth.getUser(signedIn.data.session.access_token);
    if (verified.error || verified.data.user?.id !== signedIn.data.user.id) throw new Error('Local identity verification failed');
  }
  const environment = {
    DATABASE_URL: saved.servingUrl, MIGRATION_DATABASE_URL: saved.setupUrl,
    SUPABASE_URL: saved.url, SUPABASE_SECRET_KEY: saved.secretKey, DEFAULT_ASSISTANT_MODEL: 'unqualified/disabled',
  };
  const contents = Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n';
  if (existsSync(servingFile)) {
    if (await readFile(servingFile, 'utf8') !== contents) throw new Error('Refusing to overwrite modified serving config');
  } else await writeFile(servingFile, contents, { flag: 'wx', mode: 0o600 });
  setupPhase = 'supported native initialization';
  await exec('pnpm', ['db:prepare'], {
    cwd: root, env: { ...process.env, MIGRATION_DATABASE_URL: saved.setupUrl, WORKPRINT_ENV_FILE: servingFile }, timeout: 60000,
  });
  await writeFile('outputs/local-supabase-prepare.log', 'Supported native initialization succeeded.\n', { mode: 0o600 });
  await sql(saved.setupUrl, 'GRANT USAGE ON SCHEMA mastra TO workprint_serving; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mastra TO workprint_serving; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mastra TO workprint_serving');
  console.info('Workprint local Supabase prepared; two synthetic identities verified. Private config: outputs/local-supabase.env');
}

if (process.argv.includes('--setup')) {
  try { await prepareLocal(); } catch {
    console.error(`Local Supabase setup failed during ${setupPhase}; preserve private files and inspect only the Workprint target`);
    process.exitCode = 1;
  }
}
