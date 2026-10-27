import { Mastra } from '@mastra/core';
import { registerApiRoute, type ApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { loadServerConfig } from './config.js';
import { verifyAccount } from './auth.js';

/** Explicit composition only: production supplies no routes; tests build their own probe entry. */
export async function createBackend(routes: ApiRoute[] = []) {
  const config = loadServerConfig(process.env);
  const pool = new Pool({
    connectionString: config.connectionString, max: 4, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000, statement_timeout: 10000,
  });
  pool.on('error', (error) => {
    const code = 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code : 'connection_error';
    console.error('Native storage idle connection lost', { code });
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
  return new Mastra({
    storage,
    server: {
      host: '127.0.0.1', port: config.port,
      build: { swaggerUI: false, openAPIDocs: false },
      apiRoutes: [
        ...routes,
        // Mastra skips server middleware for framework-public routes. Custom routes
        // precede native registration, so this terminal fallback closes those too.
        registerApiRoute('/*', {
          method: 'ALL',
          handler: (context) => context.json({ error: { code: 'not_found', message: 'Not found' } }, 404),
        }),
      ],
      middleware: [async (context, next) => {
        if (context.req.path === '/health' && context.req.method === 'GET') return next();
        // Default-deny before native handlers, regardless of caller identity.
        if (!routes.some((route) => route.path === context.req.path && route.method === context.req.method)) {
          return context.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
        }
        const identity = await verifyAccount(context.req.header('Authorization'), config.supabase);
        if (identity.kind === 'unauthorized') {
          return context.json({ error: { code: 'unauthenticated', message: 'Authentication required' } }, 401);
        }
        if (identity.kind === 'unavailable') {
          return context.json({ error: { code: 'integration_failure', message: 'Authentication unavailable' } }, 503);
        }
        context.get('requestContext').set('accountId', identity.accountId);
        return next();
      }],
    },
  });
}
