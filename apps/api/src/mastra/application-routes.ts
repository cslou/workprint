import { registerApiRoute } from '@mastra/core/server';
import { applicationError, errorStatus, operations, type OperationName } from '@workprint/contracts';
import type { Application } from '../application/index.js';
import { readBody } from './body.js';

export const applicationRoutes = (application: Application) => (Object.keys(operations) as OperationName[]).map((name) => {
  const operation = operations[name];
  return registerApiRoute(operation.path, { method: operation.method, handler: async (context) => {
    const accountId: unknown = context.get('requestContext').get('accountId');
    if (typeof accountId !== 'string') return context.json(applicationError('unauthenticated', 'Authentication required'), 401);
    let body: unknown;
    const query: Record<string, unknown> = Object.create(null);
    try {
      body = await readBody(context.req.raw);
      for (const [key, value] of new URL(context.req.url).searchParams) {
        if (Object.hasOwn(query, key)) throw new Error('Repeated query');
        query[key] = key === 'limit' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
      }
    } catch {
      return context.json(applicationError('invalid_input', 'Invalid application request'), 400);
    }
    const result = await application.operations[name]({ params: context.req.param(), query, body }, async () => ({ kind: 'verified', accountId }));
    return Response.json(result, { status: errorStatus[result.error.code] });
  } });
});
