import { Mastra } from '@mastra/core';
import { registerApiRoute, type ApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { loadServerConfig } from './config.js';
import { verifyAccount } from './auth.js';
import { applicationRoutes } from './application-routes.js';

/** One backend: cataloged application routes plus explicit test-composition additions. */
export async function createBackend(routes: ApiRoute[] = []) {
  const protectedRoutes = [...applicationRoutes, ...routes];
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
    const result = await pool.query<{ privileged: boolean }>(`WITH native_schema AS (
      SELECT oid, nspowner FROM pg_namespace WHERE nspname = 'mastra'
    ), native_owners AS (
      SELECT nspowner AS owner FROM native_schema
      UNION SELECT relowner FROM pg_class WHERE relnamespace IN (SELECT oid FROM native_schema)
      UNION SELECT proowner FROM pg_proc WHERE pronamespace IN (SELECT oid FROM native_schema)
      UNION SELECT typowner FROM pg_type WHERE typnamespace IN (SELECT oid FROM native_schema)
    ) SELECT
      has_database_privilege(current_database(), 'CREATE') OR
      has_schema_privilege('mastra', 'CREATE') OR
      has_schema_privilege('public', 'CREATE') OR
      (SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = current_user) OR
      EXISTS (SELECT 1 FROM native_owners WHERE pg_has_role(current_user, owner, 'USAGE') OR pg_has_role(current_user, owner, 'SET'))
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
        ...protectedRoutes,
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
        if (!protectedRoutes.some((route) => {
          const template = route.path.split('/');
          const segments = context.req.path.split('/');
          return route.method === context.req.method && template.length === segments.length &&
            template.every((part, index) => /^:[A-Za-z][A-Za-z0-9_]*$/.test(part) ? Boolean(segments[index]) : part === segments[index]);
        })) {
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
