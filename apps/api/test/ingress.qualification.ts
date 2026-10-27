import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { verifyBuiltAdmission } from './auth-built-fixture.js';

// B-001: explicitly deferred from private/local-development acceptance, not a
// skipped/passing test. This command must fail until ingress is actually fixed.
test('B-001: unfinished request ingress qualification', { timeout: 180000 }, async (t) => {
  await verifyBuiltAdmission(t, async ({ origin, accessToken }) => {
    for (const authenticated of [false, true]) {
      await t.test(authenticated ? 'authenticated upload receives bounded invalid_input' : 'unauthenticated upload rejects before body parsing', async () => {
        const started = Date.now();
        const unfinished = request(`${origin}/v1/conversations/c/versions`, {
          method: 'POST', headers: { ...(authenticated ? { Authorization: `Bearer ${accessToken}` } : {}), 'Content-Type': 'application/json' },
        });
        // This independent watchdog fails; it never fabricates server success.
        const watchdog = setTimeout(() => unfinished.destroy(new Error('Server request-body deadline did not settle')), 5000);
        try {
          const settled = new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
            unfinished.once('error', reject);
            unfinished.once('response', (response) => {
              let body = '';
              response.setEncoding('utf8');
              response.on('data', (chunk: string) => { body += chunk; });
              response.once('error', reject);
              response.once('end', () => resolve({ status: response.statusCode, body }));
            });
          });
          unfinished.write('{"operationId":"unfinished","kind":"script","content":');
          const response = await settled;
          assert.equal(response.status, authenticated ? 400 : 401);
          assert.deepEqual(JSON.parse(response.body), { error: authenticated
            ? { code: 'invalid_input', message: 'Invalid application request' }
            : { code: 'unauthenticated', message: 'Authentication required' } });
          assert.ok(Date.now() - started < 3500, 'Server responds inside 3.5 seconds, before the 5-second watchdog');
          assert.equal(unfinished.writableEnded, false, 'Upload is still unfinished when the server rejects');
        } finally { clearTimeout(watchdog); unfinished.destroy(); }
      });
    }
  });
});
