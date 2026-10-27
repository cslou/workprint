import { registerApiRoute } from '@mastra/core/server';
import { applicationError, errorStatus, operations, type OperationName } from '@workprint/contracts';
import { unavailableApplication } from '../application/index.js';

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) return {};
  if (request.method === 'GET' || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new Error('Invalid body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Body deadline')), 2000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error('Body limit');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

export const applicationRoutes = (Object.keys(operations) as OperationName[]).map((name) => {
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
    const result = await unavailableApplication[name]({ params: context.req.param(), query, body }, async () => ({ kind: 'verified', accountId }));
    return Response.json(result, { status: errorStatus[result.error.code] });
  } });
});
