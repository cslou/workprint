import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { loadServerConfig } from './config.js';

const config = loadServerConfig(process.env);
const pool = new Pool({
  connectionString: config.connectionString,
  max: 4,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 5000,
  statement_timeout: 10000,
});
try {
  const result = await pool.query<{ privileged: boolean }>(`SELECT
    has_database_privilege(current_database(), 'CREATE') OR
    has_schema_privilege('mastra', 'CREATE') OR
    has_schema_privilege('public', 'CREATE') OR
    (SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = current_user)
    AS privileged`);
  if (result.rows[0]?.privileged !== false) throw new Error('Privileged serving connection');
} catch {
  await pool.end();
  throw new Error('Serving storage unavailable or privileged; prepare storage separately and use restricted DATABASE_URL');
}
const storage = new PostgresStore({ id: 'workprint-native', schemaName: 'mastra', disableInit: true, pool });

// No Agent, provider, workflow or telemetry exporter is enabled in this foundation.
export const mastra = new Mastra({
  storage,
  server: {
    host: '127.0.0.1',
    port: config.port,
    build: { swaggerUI: false, openAPIDocs: false },
    middleware: [async (context, next) => {
      if (context.req.path !== '/health' || context.req.method !== 'GET') {
        return context.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
      }
      return next();
    }],
  },
});
