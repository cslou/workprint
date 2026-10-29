import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { environment, sentinel } from './environment.js';
import { loadAuthFixture, readPrivateJson, signInFixtureAccount, startAuthServer } from './auth-server.js';
import { createApiClient } from '@workprint/api-client';
import { operations, type OperationName, type OperationRequest } from '@workprint/contracts';
import { applicationRequests } from './application-requests.js';
import { query } from './postgres.js';
import { buildServerComposition } from './built-server.js';

// Shared by current-scope checks and the separately invoked B-001 qualification.
// Private fixture input is never inherited by serving. Accounts already exist.
export type BuiltAdmissionTarget = { origin: string; accessToken: string; accessTokens: readonly string[]; logs: string };
type FixtureContext = { diagnostic(message: string): void; after(cleanup: () => void | Promise<void>): void };
export async function verifyBuiltAdmission(t: FixtureContext, qualifyIngress?: (server: BuiltAdmissionTarget) => Promise<void>, options: { browserOrigin?: string } = {}) {
  const config = await loadAuthFixture();
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  const statusFile = process.env.WORKPRINT_AUTH_SIGNING_FIXTURE;
  assert.ok(statusFile, 'Supply private CLI status JSON to exercise a signed expired token');
  const { JWT_SECRET: signingKey } = await readPrivateJson(statusFile) as { JWT_SECRET: string };
  assert.ok(signingKey, 'Signing fixture must supply the authorized development signing key');
  assert.equal(config.accounts.length, 2);
  // Separate compiled compositions share the production entry, never an environment-switched probe.
  const probeEntry = await buildServerComposition(fixture.logs, 'probe', (directory) => `
    import { createBackend } from ${JSON.stringify(join(directory, 'mastra/backend.js'))};
    import { registerApiRoute } from '@mastra/core/server';
    const mastra = await createBackend([registerApiRoute('/__auth_probe', {
      method: 'GET', handler: (c) => c.json({ accountId: c.get('requestContext').get('accountId') })
    })]);
  `, fixture.env);
  const productionEntry = await buildServerComposition(fixture.logs, 'production', undefined, fixture.env);
  // Fresh sign-ins happen after building. Never log request/response credentials.
  const identities = await Promise.all(config.accounts.map((account) => signInFixtureAccount(config, account)));
  assert.notEqual(identities[0]!.user.id, identities[1]!.user.id);
  const servingEnv = options.browserOrigin ? { WORKPRINT_BROWSER_ORIGIN: options.browserOrigin } : {};
  const { server: probe, origin, port } = await startAuthServer(probeEntry, fixture.env, config, join(fixture.logs, 'probe.log'), { env: servingEnv });
  t.after(probe.stop);
  for (const identity of identities) {
    const response = await fetch(`${origin}/__auth_probe?ownerId=${identities[1]!.user.id}`, {
      headers: { Authorization: `Bearer ${identity.access_token}`, 'X-Owner-Id': identities[1]!.user.id },
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accountId: identity.user.id });
  }
  // The separately authorized CLI stack's signing secret creates a genuinely signed expired token.
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const tokenParts = identities[0]!.access_token.split('.');
  const tokenPayload = JSON.parse(Buffer.from(tokenParts[1]!, 'base64url').toString()) as Record<string, unknown>;
  const signingControlPayload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(tokenPayload)}`;
  const signingControl = `${signingControlPayload}.${createHmac('sha256', signingKey).update(signingControlPayload).digest('base64url')}`;
  const controlResponse = await fetch(`${origin}/__auth_probe`, {
    headers: { Authorization: `Bearer ${signingControl}` }, signal: AbortSignal.timeout(4000),
  });
  assert.equal(controlResponse.status, 200, 'Actual Supabase must accept the signing control before expiry rejection counts');
  assert.deepEqual(await controlResponse.json(), { accountId: identities[0]!.user.id });
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ ...tokenPayload, exp: Math.floor(Date.now() / 1000) - 60, iat: Math.floor(Date.now() / 1000) - 120 })}`;
  const expired = `${payload}.${createHmac('sha256', signingKey).update(payload).digest('base64url')}`;
  const forged = `${identities[0]!.access_token.split('.').slice(0, 1).join('.')}.${encode({ sub: identities[1]!.user.id, exp: 9999999999 })}.${identities[0]!.access_token.split('.')[2]}`;
  for (const authorization of ['', `Basic ${sentinel}`, 'Bearer malformed', `Bearer ${'a'.repeat(8193)}`, 'Bearer e30.e30.invalid', `Bearer ${forged}`, `Bearer ${expired}`]) {
    const response = await fetch(`${origin}/__auth_probe`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(4000) });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: { code: 'unauthenticated', message: 'Authentication required' } });
  }
  await probe.stop();
  // Failure fixtures never return identity: success above always used actual Supabase.
  const upstream = createServer((req, res) => {
    if (req.headers.apikey === 'failure') { res.writeHead(500); res.end(sentinel); }
    else if (req.headers.apikey === 'malformed') { res.writeHead(200); res.end('{'); }
    else if (req.headers.apikey === 'body-stall') { res.writeHead(200); res.flushHeaders(); }
    // Other requests deliberately stall before headers.
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  for (const key of ['failure', 'malformed', 'stall', 'body-stall']) {
    const { server: failure } = await startAuthServer(probeEntry, fixture.env, config, join(fixture.logs, `${key}.log`), {
      port, env: { ...servingEnv, SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_PUBLISHABLE_KEY: key },
    });
    try {
      const before = Date.now();
      const response = await fetch(`${origin}/__auth_probe`, {
        headers: { Authorization: `Bearer ${identities[0]!.access_token}` }, signal: AbortSignal.timeout(4000),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: { code: 'integration_failure', message: 'Authentication unavailable' } });
      assert.ok(Date.now() - before < 3000, 'Built admission settles inside 3 seconds');
    } finally { await failure.stop(); }
  }
  upstream.closeAllConnections();
  await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  // Production composition has no probe, even with valid auth and test-looking env flags.
  const { server: production } = await startAuthServer(productionEntry, fixture.env, config, join(fixture.logs, 'production.log'), {
    port, env: { ...servingEnv, WORKPRINT_AUTH_PROBE: '1', NODE_ENV: 'test' },
  });
  t.after(production.stop);
  // The same built production artifact/admission fixture proves all application routes.
  const snapshot = async () => {
    const tables = await query(config.servingUrl, "SELECT tablename FROM pg_tables WHERE schemaname = 'mastra' ORDER BY tablename");
    const fingerprints: unknown[] = [];
    for (const row of tables.rows as { tablename: string }[]) {
      const table = row.tablename.replaceAll('"', '""');
      const result = await query(config.servingUrl, `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) AS digest FROM mastra."${table}" t`);
      fingerprints.push([row.tablename, result.rows[0]]);
    }
    return fingerprints;
  };
  const beforeRequests = await snapshot();
  for (const identity of identities) {
    const client = createApiClient({ baseUrl: origin, getAccessToken: async () => identity.access_token });
    // Preserve the key/input correlation when dynamically iterating the mapped client.
    const invoke = <N extends OperationName>(name: N) => (client[name] as (input: OperationRequest<N>) => Promise<unknown>)(applicationRequests[name]);
    for (const name of Object.keys(operations) as OperationName[]) {
      const result = await invoke(name);
      assert.deepEqual(result, { ok: false, error: { code: 'not_implemented', message: 'This operation is not implemented' } }, name);
    }
  }
  const raw = async (path: string, method: string, body: string | undefined, token = identities[0]!.access_token) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' }, ...(body !== undefined ? { body } : {}), signal: AbortSignal.timeout(4000) });
    return { status: response.status, payload: await response.json() as { error: { code: string } } };
  };
  for (const token of ['', 'malformed', expired]) {
    const client = createApiClient({ baseUrl: origin, getAccessToken: async () => token || null });
    const invoke = <N extends OperationName>(name: N) => (client[name] as (input: OperationRequest<N>) => Promise<unknown>)(applicationRequests[name]);
    for (const name of Object.keys(operations) as OperationName[]) {
      assert.deepEqual(await invoke(name), { ok: false, error: { code: 'unauthenticated', message: 'Authentication required' } }, `${name} must require real Auth`);
    }
    const response = await raw('/v1/conversations/c/versions', 'POST', '{', token);
    assert.equal(response.status, 401, 'Identity rejects before application validation of completed malformed JSON');
    assert.equal(response.payload.error.code, 'unauthenticated');
  }
  for (const [path, method, body] of [
    ['/v1/conversations/c/versions', 'POST', '{'],
    ['/v1/conversations/c/versions', 'POST', JSON.stringify({ ...applicationRequests.saveVersion.body, accountId: identities[1]!.user.id })],
    ['/v1/conversations/c/uses', 'POST', JSON.stringify({ operationId: 'op', purpose: 'panel_image', versionId: 'v', shotId: 's' })],
    ['/v1/questions/q/answers', 'POST', JSON.stringify({ questionRevision: 1, optionId: 'approve' })],
    ['/v1/library?ownerId=forged', 'GET', undefined],
    ['/v1/library?__proto__=forged', 'GET', undefined],
    ['/v1/library?limit=not-a-number', 'GET', undefined],
    ['/v1/library?limit=1&limit=2', 'GET', undefined],
  ] as const) {
    const response = await raw(path, method, body);
    assert.equal(response.status, 400, `${method} ${path}`);
    assert.equal(response.payload.error.code, 'invalid_input');
  }
  const oversizedInput = { ...applicationRequests.saveVersion, body: { ...applicationRequests.saveVersion.body, content: { text: 'x'.repeat(1024 * 1024) } } };
  assert.equal(operations.saveVersion.request.safeParse(oversizedInput).success, true, 'Oversized JSON is otherwise schema-valid');
  const oversizedBody = JSON.stringify(oversizedInput.body);
  assert.ok(Buffer.byteLength(oversizedBody) > 1024 * 1024);
  const oversized = await raw('/v1/conversations/c/versions', 'POST', oversizedBody);
  assert.equal(oversized.status, 400, 'Application rejects completed JSON beyond 1 MiB');
  assert.equal(oversized.payload.error.code, 'invalid_input');

  if (qualifyIngress) await qualifyIngress({ origin, accessToken: identities[0]!.access_token, accessTokens: identities.map((identity) => identity.access_token), logs: fixture.logs });
  for (const [path, method] of [['/v1/conversations/c/workspace/extra', 'GET'], ['/v1/conversations//workspace', 'GET'], ['/v1/conversations/c/workspace', 'POST'], ['/v1/library/', 'GET']] as const) {
    assert.equal((await raw(path, method, undefined)).status, 404, 'Only exact catalog paths/methods are admitted');
  }
  // No product resources exist; these arbitrary IDs prove no ownership semantics.
  assert.deepEqual(await snapshot(), beforeRequests, 'Unavailable matrix creates/changes no native records');
  const exposure: { path: string; bearer: boolean; status: number }[] = [];
  for (const path of ['/api/auth/capabilities', '/api/auth/me', '/__auth_probe', '/api/agents', '/api/memory/threads', '/api/workflows', '/api/tools', '/api/telemetry', '/swagger-ui', '/openapi.json', '/health/', '/__qualification', '/__qualification/release', '/test/shell.html', '/fixtures/clip.webm', '/studio', '/assets/index.js', '/api/tools/test/execute']) {
    for (const bearer of [false, true]) {
      const response = await fetch(`${origin}${path}`, {
        headers: bearer ? { Authorization: `Bearer ${identities[0]!.access_token}` } : {}, signal: AbortSignal.timeout(3000),
      });
      exposure.push({ path, bearer, status: response.status });
      await response.body?.cancel();
    }
  }
  assert.deepEqual(exposure, exposure.map((entry) => ({ ...entry, status: 404 })), 'Every unregistered route must remain closed, including framework-public Auth handlers');
  await production.stop();
  for (const name of ['probe.log', 'production.log', 'probe-build.log', 'production-build.log', 'failure.log', 'malformed.log', 'stall.log', 'body-stall.log']) {
    const log = await readFile(join(fixture.logs, name), 'utf8');
    for (const secret of [sentinel, signingKey, signingControl, expired, config.anonKey, config.servingUrl, new URL(config.servingUrl).password, ...config.accounts.map((account) => account.password), ...identities.map((identity) => identity.access_token)]) assert.ok(!log.includes(secret));
  }
  await fixture.noNetwork();
}
