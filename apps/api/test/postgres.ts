import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';

const exec = promisify(execFile);
// Immutable multi-platform image; never uses or resets a developer's Supabase stack.
export const postgresImage = 'postgres@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b';
const docker = async (...args: string[]) => (await exec('docker', args, { timeout: 30000 })).stdout.trim();

export async function query(url: string, sql: string) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 1000, statement_timeout: 5000 });
  try {
    await client.connect();
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function isolatedPostgres() {
  const owner = randomUUID();
  const password = randomBytes(24).toString('hex');
  const setupPassword = randomBytes(24).toString('hex');
  const servingPassword = randomBytes(24).toString('hex');
  const name = `workprint-fixture-${owner}`;
  let id: string | undefined;
  const inspect = async (reference: string) => {
    try {
      return JSON.parse(await docker('inspect', '--format', '{"id":{{json .Id}},"owner":{{json (index .Config.Labels "workprint.fixture")}}}', reference)) as { id: string; owner: string | null };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 1 &&
        'stderr' in error && typeof error.stderr === 'string' && /No such (object|container):/.test(error.stderr)) return undefined;
      throw error;
    }
  };
  // Register name/owner-based cleanup before Docker can create anything, even without stdout.
  const close = async () => {
    const found = await inspect(id ?? name);
    if (!found) return;
    if (found.owner !== owner || !/^[0-9a-f]{64}$/.test(found.id) || (id && id !== found.id)) {
      throw new Error(`Refusing cleanup: fixture ownership mismatch (${name})`);
    }
    id = found.id;
    await docker('stop', '--timeout', '5', id);
    const deadline = Date.now() + 10000;
    while (await inspect(id)) {
      if (Date.now() > deadline) throw new Error(`Owned fixture removal deadline exceeded (${name})`);
      await delay(50);
    }
  };
  try {
    const { stdout } = await exec('docker', [
      'run', '--detach', '--rm', '--name', name,
      '--label', `workprint.fixture=${owner}`, '--publish', '127.0.0.1::5432',
      '--env', 'POSTGRES_PASSWORD', '--tmpfs', '/var/lib/postgresql/data', postgresImage,
    ], { env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 60000 });
    const acquired = await inspect(name);
    if (!acquired || acquired.id !== stdout.trim() || acquired.owner !== owner) throw new Error('Invalid Docker fixture identity');
    id = acquired.id;
    const mapping = await docker('port', id, '5432/tcp');
    const port = Number(mapping.split(':').at(-1));
    if (!Number.isInteger(port)) throw new Error('Missing ephemeral Postgres port');
    const admin = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
    const deadline = Date.now() + 30000;
    for (;;) {
      try { await query(admin, 'SELECT 1'); break; } catch {
        if (Date.now() > deadline) throw new Error('Postgres startup deadline exceeded');
        await delay(100);
      }
    }
    await query(admin, `CREATE ROLE wp_setup LOGIN PASSWORD '${setupPassword}'`);
    await query(admin, `CREATE ROLE wp_serving LOGIN PASSWORD '${servingPassword}'`);
    await query(admin, 'CREATE DATABASE workprint OWNER wp_setup');
    const adminTarget = new URL(admin);
    adminTarget.pathname = '/workprint';
    const adminDatabase = adminTarget.href;
    await query(adminDatabase, 'REVOKE ALL ON DATABASE workprint FROM PUBLIC; GRANT CONNECT ON DATABASE workprint TO wp_setup, wp_serving; REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    const setupUrl = `postgresql://wp_setup:${setupPassword}@127.0.0.1:${port}/workprint`;
    const servingUrl = `postgresql://wp_serving:${servingPassword}@127.0.0.1:${port}/workprint`;
    return {
      setupUrl, servingUrl, close,
      async terminateServingConnection(pid: number) {
        if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid fixture backend PID');
        const result = await query(adminDatabase, `SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid = ${pid} AND datname = current_database() AND usename = 'wp_serving' AND state = 'idle'`);
        if (result.rows[0]?.terminated !== true) throw new Error('Refusing to terminate an unknown or non-idle fixture connection');
      },
      async grantServing() {
        // Privilege grants only; all native DDL is exclusively PostgresStore.init().
        await query(setupUrl, 'GRANT USAGE ON SCHEMA mastra TO wp_serving; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mastra TO wp_serving; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mastra TO wp_serving');
      },
    };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Postgres fixture acquisition/setup failed and owned cleanup failed', { cause: cleanupError });
    }
    throw error;
  }
}
