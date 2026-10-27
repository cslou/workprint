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
  const { stdout } = await exec('docker', [
    'run', '--detach', '--rm', '--name', `workprint-fixture-${owner}`,
    '--label', `workprint.fixture=${owner}`, '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_PASSWORD', '--tmpfs', '/var/lib/postgresql/data', postgresImage,
  ], { env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 60000 });
  const id = stdout.trim();
  const close = async () => {
    const label = await docker('inspect', '--format', '{{index .Config.Labels "workprint.fixture"}}', id);
    if (label !== owner) throw new Error('Refusing cleanup: fixture ownership mismatch');
    await docker('stop', '--time', '5', id);
  };
  try {
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
      async grantServing() {
        // Privilege grants only; all native DDL is exclusively PostgresStore.init().
        await query(setupUrl, 'GRANT USAGE ON SCHEMA mastra TO wp_serving; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mastra TO wp_serving; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mastra TO wp_serving');
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
