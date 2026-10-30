import type { HttpBindings } from '@hono/node-server';
import type { Mastra } from '@mastra/core';
import type { Context, MiddlewareHandler } from 'hono';
import { verifyAccount } from './auth.js';
import { loadServerConfig } from './config.js';
import { readIntake } from './body.js';
import { createAdmissionPolicy, decorateCors } from './admission.js';

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
  const policy = createAdmissionPolicy(mastra.getServer()?.apiRoutes ?? [], config.browserOrigin);
  return async (context, next) => {
    const { origin, preflight } = policy.cors(context);
    if (origin && preflight) return context.body(null, 204);
    const incoming = context.env?.incoming;
    // The pinned adapter omits GET payloads from WebRequest.body. Read framing only.
    const getHasBody = context.req.method === 'GET' &&
      (incoming?.headers['transfer-encoding'] !== undefined || Number(incoming?.headers['content-length'] ?? 0) > 0);
    const reject = (status: 400 | 401 | 404 | 503, code: string, message: string) => {
      // Finish the exact JSON response before closing an unfinished HTTP/1.1 upload.
      // The supported adapter bindings expose these owned request/response resources.
      context.header('Connection', 'close');
      const socket = incoming?.socket;
      if (incoming && socket && !socket.destroyed) context.env.outgoing.once('finish', () => {
        incoming.destroy();
        socket.destroySoon();
      });
      return context.json({ error: { code, message } }, status);
    };
    const invalid = () => reject(400, 'invalid_input', 'Invalid application request');
    if (context.req.path === '/health' && context.req.method === 'GET') return getHasBody ? invalid() : next();
    if (!policy.matchesRoute(context.req.path, context.req.method)) return reject(404, 'not_found', 'Not found');
    // Accessing the lazy WebRequest signal here would also construct/prefetch its body.
    // Observe the public transport binding instead, before awaiting online Auth.
    const cancellation = new AbortController();
    const outgoing = context.env?.outgoing;
    const closed = () => {
      if (outgoing && !outgoing.writableFinished) {
        cancellation.abort();
        incoming?.destroy();
      }
    };
    outgoing?.on('close', closed);
    if (outgoing?.destroyed) closed();
    try {
      const identity = await verifyAccount(context.req.header('Authorization'), auth);
      if (cancellation.signal.aborted) return invalid();
      if (identity.kind === 'unauthorized') return reject(401, 'unauthenticated', 'Authentication required');
      if (identity.kind === 'unavailable') return reject(503, 'integration_failure', 'Authentication unavailable');
      if (getHasBody) return invalid();
      context.set(verifiedAccountKey, identity.accountId);
      try {
        const { bytes } = await readIntake(context.req.raw);
        if (cancellation.signal.aborted) return invalid();
        context.req.raw = new Request(context.req.raw, {
          body: bytes ?? null, signal: AbortSignal.any([context.req.raw.signal, cancellation.signal]),
        });
      } catch {
        return invalid();
      }
      await next();
      if (origin) decorateCors(context, origin);
      return context.res;
    } finally {
      outgoing?.off('close', closed);
    }
  };
}
