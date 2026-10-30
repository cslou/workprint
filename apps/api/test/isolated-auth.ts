import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthFixtureResources } from './auth-fixture-resources.js';
import { isolatedPostgres, query } from './postgres.js';
import { unusedPort } from './process.js';
import { capturedRecoveryLink } from './auth-mail.js';

// Installed official Supabase CLI images, pinned by observed immutable RepoDigest.
// Mailpit provenance: github.com/axllent/mailpit, MIT, Supabase public ECR mirror v1.31.3.
export const authFixtureImages = {
  auth: 'public.ecr.aws/supabase/gotrue@sha256:87db8c737af49a64236c461882ed3925f8b1e5c2c47176c64694dedc65153573',
  mail: 'public.ecr.aws/supabase/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d',
  gateway: 'public.ecr.aws/supabase/kong@sha256:1b53405d8680a09d6f44494b7990bf7da2ea43f84a258c59717d4539abf09f6d',
} as const;

const jwt = (role: string, secret: string) => {
  const now = Math.floor(Date.now() / 1000);
  const value = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: now, exp: now + 3600 })).toString('base64url')}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
};

/** Real isolated services only: no shared fixtures/configuration, generated links or identity bypass. */
export async function isolatedAuth(options: { lifetimeMs?: number; jwtExpirySeconds?: number; otpExpirySeconds?: number } = {}) {
  for (const value of [options.lifetimeMs ?? 900000, options.jwtExpirySeconds ?? 300, options.otpExpirySeconds ?? 300]) {
    if (!Number.isInteger(value) || value < 1) throw new Error('Fixture bounds must be positive integers');
  }
  if ((options.lifetimeMs ?? 900000) > 900000 || (options.jwtExpirySeconds ?? 300) > 3600 || (options.otpExpirySeconds ?? 300) > 3600) throw new Error('Fixture bounds exceed supported test lifetime');
  const resources = new AuthFixtureResources();
  const parent = join(process.cwd(), 'outputs', 'fixtures', 'auth');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const directory = join(parent, resources.owner);
  await mkdir(directory, { mode: 0o700 });
  const privateFile = join(directory, 'fixture.private.json');
  const configFile = join(directory, 'gateway.private.json');
  const files = new Map<string, string>();
  let database: Awaited<ReturnType<typeof isolatedPostgres>> | undefined;
  let closing: Promise<void> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const close = () => closing ??= (async () => {
    clearTimeout(lifetime);
    const errors: unknown[] = [];
    for (const cleanup of [() => resources.closeContainers(), () => database?.close(), () => resources.closeNetwork()]) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
    for (const [file, expected] of files) {
      try {
        if (await readFile(file, 'utf8') !== expected) throw new Error('Fixture private file changed; preserved for its owner');
      } catch (error) { errors.push(error); }
    }
    const expectedNames = new Set([...files.keys()].map(file => file.split('/').at(-1)));
    if ((await readdir(directory)).some(file => !expectedNames.has(file))) errors.push(new Error('Unexpected file in fixture directory; preserved for its owner'));
    if (!errors.length) await rm(directory, { recursive: true });
    if (errors.length) throw new AggregateError(errors, 'Isolated Auth owned cleanup failed; private ownership record preserved');
  })();
  const savePrivate = async (file: string, value: unknown) => {
    const contents = JSON.stringify(value);
    await writeFile(file, contents, { flag: 'wx', mode: 0o600 }); files.set(file, contents);
  };
  const active = () => { if (expired || closing) throw new Error('Isolated Auth fixture is closed or expired'); };
  try {
    await savePrivate(join(directory, 'owner.private.json'), { owner: resources.owner, kind: 'isolated-auth-fixture' });
    await resources.createNetwork();
    database = await isolatedPostgres({ network: { name: resources.edgeNetworkName, owner: resources.owner } });
    await resources.attachPrivate(database.containerId, database.owner, 'database');
    // GoTrue owns every table/migration; standalone deployment supplies its empty namespace.
    await query(database.adminUrl, 'CREATE SCHEMA auth AUTHORIZATION postgres');
    const dbUrl = new URL(database.adminUrl); dbUrl.hostname = 'database'; dbUrl.port = '5432'; dbUrl.searchParams.set('search_path', 'auth');
    const port = await unusedPort();
    const url = `http://127.0.0.1:${port}`;
    const secret = randomBytes(48).toString('hex');
    const anonKey = jwt('anon', secret), serviceKey = jwt('service_role', secret);
    const gateway = {
      _format_version: '2.1', services: [{ name: 'auth', url: 'http://auth:9999/', routes: [{ name: 'auth', paths: ['/auth/v1/'], strip_path: true }] }],
      plugins: [{ name: 'cors', config: { origins: ['http://127.0.0.1:4179', 'http://127.0.0.1:4180'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], headers: ['Authorization', 'Content-Type', 'apikey', 'X-Client-Info', 'X-Supabase-Api-Version'], credentials: false } }],
    };
    await savePrivate(configFile, gateway);
    const mail = await resources.run('mail', authFixtureImages.mail, ['--publish', '127.0.0.1::8025', '--tmpfs', '/tmp:rw,nosuid,size=67108864'], {
      MP_SMTP_BIND_ADDR: '0.0.0.0:1025', MP_UI_BIND_ADDR: '0.0.0.0:8025', MP_DATABASE: '/tmp/mailpit.db', MP_MAX_MESSAGES: '100',
    });
    const mailUrl = `http://127.0.0.1:${await resources.port(mail, 8025)}`;
    const auth = await resources.run('auth', authFixtureImages.auth, [], {
      API_EXTERNAL_URL: url, GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: dbUrl.href,
      GOTRUE_SITE_URL: 'http://127.0.0.1:4179', GOTRUE_URI_ALLOW_LIST: 'http://127.0.0.1:4179/auth/callback,http://127.0.0.1:4180/auth/callback',
      GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_EXTERNAL_PHONE_ENABLED: 'false', GOTRUE_MAILER_AUTOCONFIRM: 'false',
      GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_EXP: String(options.jwtExpirySeconds ?? 300),
      GOTRUE_SMTP_HOST: 'mail', GOTRUE_SMTP_PORT: '1025', GOTRUE_SMTP_ADMIN_EMAIL: 'auth@fixture.invalid', GOTRUE_SMTP_SENDER_NAME: 'Isolated Workprint fixture', GOTRUE_SMTP_MAX_FREQUENCY: '1s',
      GOTRUE_MAILER_OTP_EXP: String(options.otpExpirySeconds ?? 300), GOTRUE_RATE_LIMIT_EMAIL_SENT: '100', GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify',
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify',
    });
    const gatewayId = await resources.run('gateway', authFixtureImages.gateway, ['--user', '0:0', '--publish', `127.0.0.1:${port}:8000`, '--mount', `type=bind,source=${configFile},target=/tmp/gateway.json,readonly`], {
      KONG_DATABASE: 'off', KONG_DECLARATIVE_CONFIG: '/tmp/gateway.json', KONG_PROXY_LISTEN: '0.0.0.0:8000', KONG_ADMIN_LISTEN: 'off', KONG_NGINX_WORKER_PROCESSES: '1', KONG_PROXY_ACCESS_LOG: '/dev/null', KONG_PROXY_ERROR_LOG: '/dev/stderr',
    });
    await resources.port(gatewayId, 8000);
    await savePrivate(privateFile, { owner: resources.owner, url, anonKey, serviceKey, mailUrl, signingSecret: secret, networkId: resources.networkId, containers: resources.containerIds });
    const deadline = Date.now() + 45000;
    for (;;) {
      let ready = false;
      try { ready = (await fetch(url + '/auth/v1/health', { signal: AbortSignal.timeout(1000) })).ok && (await fetch(mailUrl + '/api/v1/info', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Services are not ready; bounded below. */ }
      if (ready) break;
      if (Date.now() > deadline) throw new Error(`Isolated Auth/mail startup deadline exceeded (owned auth ${auth})`);
      await delay(100);
    }
    lifetime = setTimeout(() => { expired = true; void close(); }, options.lifetimeMs ?? 900000); lifetime.unref();
    const request = (path: string, body?: unknown, token?: string, method?: string) => {
      active();
      return fetch(`${url}/auth/v1/${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000), redirect: 'manual' });
    };
    const accounts = new Set<string>();
    const seenMessages = new Set<string>();
    const createAccount = async () => {
      active();
      const email = `workprint-${randomUUID()}@fixture.invalid`, password = `A1!${randomBytes(24).toString('hex')}`, nextPassword = `B2!${randomBytes(24).toString('hex')}`;
      const response = await request('admin/users', { email, password, email_confirm: true }, serviceKey);
      if (!response.ok) throw new Error(`Isolated account creation failed (${response.status})`);
      const value = await response.json() as { id: string; email: string };
      if (!/^[0-9a-f-]{36}$/i.test(value.id) || value.email !== email) throw new Error('Invalid isolated account response');
      accounts.add(email);
      return { id: value.id, email, password, nextPassword };
    };
    const recoveryLink = (recipient: string) => {
      active();
      if (!accounts.has(recipient)) throw new Error('Refusing mail access for an account not created by this fixture');
      return capturedRecoveryLink(mailUrl, url, recipient, seenMessages);
    };
    return { url, anonKey, serviceKey, mailUrl, privateFile, containerIds: [...resources.containerIds, database.containerId], networkId: resources.networkId, networkIds: [resources.networkId, resources.edgeNetworkId], request, createAccount, recoveryLink, close };
  } catch (error) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Isolated Auth acquisition and cleanup failed', { cause: cleanupError }); }
    throw error;
  }
}
