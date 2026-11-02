import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { routeTimeouts } from '../../../src/mastra/server.js';

test('turn stream routes get the turn bound; Stop and every other route keep the general limit', async () => {
  const app = new Hono();
  app.use('*', routeTimeouts(50, 1000));
  const slow = async () => { await new Promise(resolve => setTimeout(resolve, 150)); return Response.json({ answered: true }); };
  for (const tail of ['send-message', 'threads/subscribe', 'observe', 'threads/abort']) app.post(`/api/agents/assistant/${tail}`, slow);
  app.get('/v1/conversations/x/workspace', slow);
  app.get('/api/agents/assistant/send-message', slow);
  const status = async (method: string, path: string) => (await app.request(path, { method })).status;
  assert.deepEqual(await Promise.all([
    status('POST', '/api/agents/assistant/send-message'), status('POST', '/api/agents/assistant/threads/subscribe'), status('POST', '/api/agents/assistant/observe'),
    status('POST', '/api/agents/assistant/threads/abort'), status('GET', '/v1/conversations/x/workspace'), status('GET', '/api/agents/assistant/send-message'),
  ]), [200, 200, 200, 504, 504, 504]);
});
