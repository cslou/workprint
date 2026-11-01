import type { ApiRoute } from '@mastra/core/server';
import type { Context } from 'hono';

export function decorateCors(context: Context, origin: string, preflight = false) {
  context.header('Access-Control-Allow-Origin', origin);
  context.header('Vary', 'Origin');
  if (preflight) {
    context.header('Access-Control-Allow-Methods', 'GET,POST,PATCH');
    context.header('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  }
}

/** The same closed catalog and browser policy for ingress and native fallback. */
export function createAdmissionPolicy(routes: readonly Pick<ApiRoute, 'path' | 'method'>[], browserOrigin: string | undefined) {
  const catalog = routes.filter(route => route.path !== '/*');
  const matchesRoute = (path: string, method: string) => catalog.some(route => {
    const template = route.path.split('/');
    const segments = path.split('/');
    return route.method === method && template.length === segments.length &&
      template.every((part, index) => /^:[A-Za-z][A-Za-z0-9_]*$/.test(part) ? Boolean(segments[index]) : part === segments[index]);
  });
  const cors = (context: Context) => {
    const origin = context.req.header('Origin');
    const preflight = context.req.method === 'OPTIONS';
    const method = preflight ? context.req.header('Access-Control-Request-Method') ?? '' : context.req.method;
    const headers = (context.req.header('Access-Control-Request-Headers') ?? '').split(',').map(header => header.trim().toLowerCase()).filter(Boolean);
    const allowed = origin && origin === browserOrigin && matchesRoute(context.req.path, method) &&
      (!preflight || headers.every(header => ['authorization', 'content-type'].includes(header)));
    if (allowed) decorateCors(context, origin, preflight);
    return { origin: allowed ? origin : undefined, preflight };
  };
  return { matchesRoute, cors };
}
