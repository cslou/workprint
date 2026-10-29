import type { HttpBindings } from '@hono/node-server';
import type { Mastra } from '@mastra/core';
import type { Context, MiddlewareHandler } from 'hono';
import { verifyAccount } from './auth.js';
import { loadServerConfig } from './config.js';
import { readIntake } from './body.js';

const verifiedAccountKey = 'workprintVerifiedIngressAccount';

/** Separate from Mastra RequestContext, which native context middleware replaces. */
export function verifiedIngressAccount(context: Context): string | undefined {
  const account: unknown = context.get(verifiedAccountKey);
  return typeof account === 'string' ? account : undefined;
}

/** Catalog and identity admission must precede every native body clone or handler. */
export function createIngress(mastra: Mastra): MiddlewareHandler<{ Bindings: HttpBindings; Variables: { [verifiedAccountKey]: string } }> {
  const config = loadServerConfig(process.env);
  const auth = config.supabase;
  const browserOrigin = config.browserOrigin;
  const routes = (mastra.getServer()?.apiRoutes ?? []).filter(route => route.path !== '/*');
  const matches = (path: string, method: string) => routes.some(route => {
    const template = route.path.split('/');
    const segments = path.split('/');
    return route.method === method && template.length === segments.length &&
      template.every((part, index) => /^:[A-Za-z][A-Za-z0-9_]*$/.test(part) ? Boolean(segments[index]) : part === segments[index]);
  });
  return async (context, next) => {
    const origin = context.req.header('Origin');
    const preflight = context.req.method === 'OPTIONS';
    const method = preflight ? context.req.header('Access-Control-Request-Method') ?? '' : context.req.method;
    const headers = (context.req.header('Access-Control-Request-Headers') ?? '').split(',').map(header => header.trim().toLowerCase()).filter(Boolean);
    const allowedOrigin = origin && origin === browserOrigin && matches(context.req.path, method) &&
      (!preflight || headers.every(header => ['authorization', 'content-type'].includes(header)));
    if (allowedOrigin) {
      context.header('Access-Control-Allow-Origin', origin);
      context.header('Vary', 'Origin');
      if (preflight) {
        context.header('Access-Control-Allow-Methods', 'GET,POST,PATCH');
        context.header('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        return context.body(null, 204);
      }
    }
    if (context.req.path === '/health' && context.req.method === 'GET') return next();
    const reject = (status: 400 | 401 | 404 | 503, code: string, message: string) => {
      // Finish the exact JSON response before closing an unfinished HTTP/1.1 upload.
      // The supported adapter bindings expose these owned request/response resources.
      context.header('Connection', 'close');
      const incoming = context.env?.incoming;
      const socket = incoming?.socket;
      if (incoming && socket && !socket.destroyed) context.env.outgoing.once('finish', () => {
        incoming.destroy();
        socket.destroySoon();
      });
      return context.json({ error: { code, message } }, status);
    };
    if (!matches(context.req.path, context.req.method)) return reject(404, 'not_found', 'Not found');
    const identity = await verifyAccount(context.req.header('Authorization'), auth);
    if (identity.kind === 'unauthorized') return reject(401, 'unauthenticated', 'Authentication required');
    if (identity.kind === 'unavailable') return reject(503, 'integration_failure', 'Authentication unavailable');
    context.set(verifiedAccountKey, identity.accountId);
    try {
      const { bytes } = await readIntake(context.req.raw);
      context.req.raw = new Request(context.req.raw, { body: bytes ?? null });
    } catch {
      return reject(400, 'invalid_input', 'Invalid application request');
    }
    await next();
    if (allowedOrigin) {
      context.header('Access-Control-Allow-Origin', origin);
      context.header('Vary', 'Origin');
    }
    return context.res;
  };
}
