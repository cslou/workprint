import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { databaseUrl } from '../db/index.js';

async function prepare() {
  const connectionString = databaseUrl(process.env.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  try {
    const privilege = await pool.query<{ allowed: boolean }>("SELECT has_database_privilege(current_database(), 'CREATE') AS allowed");
    if (!privilege.rows[0]?.allowed) throw new Error('Setup connection must have database CREATE privilege');
    const store = new PostgresStore({ id: 'workprint-setup', schemaName: 'mastra', pool });
    try {
      await store.init();
      console.info('Native storage prepared');
    } finally {
      await store.close();
    }
  } finally {
    if (!pool.ended) await pool.end();
  }
}

try {
  await prepare();
} catch {
  // Database/library exceptions can contain privileged SQL or connection details.
  console.error('Native storage preparation failed; check the setup connection and privileges');
  process.exitCode = 1;
}
