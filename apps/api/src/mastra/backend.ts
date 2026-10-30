import { Mastra } from '@mastra/core';
import { registerApiRoute, type ApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { createOwnedConversationCheck } from '../agent/index.js';
import { createApplication, withSavedWork, withManualSaves } from '../application/index.js';
import { createArtifactStore, createArtifactWriters } from '../artifacts/index.js';
import { assertRestrictedRole } from '../db/index.js';
import { loadServerConfig } from './config.js';
import { verifyAccount } from './auth.js';
import { applicationRoutes } from './application-routes.js';

/** One backend: cataloged application routes plus explicit test-composition additions. */
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
    await assertRestrictedRole(pool, {
      createSchemas: ['artifacts', 'mastra', 'public'], ownershipSchemas: ['artifacts', 'mastra'],
      requiredSchemas: ['mastra', 'public'], errorMessage: 'Privileged serving connection',
    });
  } catch {
    await pool.end();
    throw new Error('Serving storage unavailable or privileged; prepare storage separately and use restricted DATABASE_URL');
  }
  const storage = new PostgresStore({ id: 'workprint-native', schemaName: 'mastra', disableInit: true, pool });
  const application = createApplication({ checkOwnedConversation: createOwnedConversationCheck(storage) });
  const savedApplication = withSavedWork(application, createArtifactStore(pool, application.checkOwnedConversation));
  const manualApplication = withManualSaves(savedApplication, createArtifactWriters(pool, application.checkOwnedConversation).human.save);
  const protectedRoutes = [...applicationRoutes(manualApplication), ...routes];
  const matchesRoute = (path: string, method: string) => protectedRoutes.some((route) => {
    const template = route.path.split('/');
    const segments = path.split('/');
    return route.method === method && template.length === segments.length &&
      template.every((part, index) => /^:[A-Za-z][A-Za-z0-9_]*$/.test(part) ? Boolean(segments[index]) : part === segments[index]);
  });
  return new Mastra({
    storage,
    server: {
      host: '127.0.0.1', port: config.port,
      // Native CORS appends framework headers even to an explicit allowHeaders list.
      // Disable it; this catalog-only policy must not expose native routes/headers.
      cors: false,
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
        const origin = context.req.header('Origin');
        const preflight = context.req.method === 'OPTIONS';
        const method = preflight ? context.req.header('Access-Control-Request-Method') ?? '' : context.req.method;
        const headers = (context.req.header('Access-Control-Request-Headers') ?? '').split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
        if (origin && origin === config.browserOrigin && matchesRoute(context.req.path, method) &&
          (!preflight || headers.every((header) => ['authorization', 'content-type'].includes(header)))) {
          context.header('Access-Control-Allow-Origin', origin);
          context.header('Vary', 'Origin');
          if (preflight) {
            context.header('Access-Control-Allow-Methods', 'GET,POST,PATCH');
            context.header('Access-Control-Allow-Headers', 'Authorization,Content-Type');
            return context.body(null, 204);
          }
        }
        if (context.req.path === '/health' && context.req.method === 'GET') return next();
        // Default-deny before native handlers, regardless of caller identity.
        if (!matchesRoute(context.req.path, context.req.method)) {
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
        await next();
        // Application adapters return a standalone Response; decorate the settled one.
        if (origin && origin === config.browserOrigin) {
          context.header('Access-Control-Allow-Origin', origin);
          context.header('Vary', 'Origin');
        }
        return context.res;
      }],
    },
  });
}
