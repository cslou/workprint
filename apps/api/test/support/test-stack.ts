import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, request as forward, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createMediaSandbox } from '../../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../../src/storage/media/pins.js';
import { AuthFixtureResources } from './auth-fixture-resources.js';
import { capturedRecoveryLink } from './auth-mail.js';
import { qualifiedMediaFixtures, qualifiedPoster } from './media-fixtures.js';
import { isolatedObjectStorage } from './object-storage.js';
import { applicationDatabase, isolatedPostgres, query } from './postgres.js';

// Installed official Supabase CLI images, pinned by observed immutable RepoDigest.
// Mailpit provenance: github.com/axllent/mailpit, MIT, Supabase public ECR mirror v1.31.3.
const images = {
  auth: 'public.ecr.aws/supabase/gotrue@sha256:87db8c737af49a64236c461882ed3925f8b1e5c2c47176c64694dedc65153573',
  mail: 'public.ecr.aws/supabase/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d',
} as const;
const stackLifetimeMs = 30 * 60_000;
const corsHeaders = 'Authorization, Content-Type, apikey, X-Client-Info, X-Supabase-Api-Version';

type StackRecord = {
  postgres: { adminUrl: string; setupPassword: string; servingPassword: string };
  auth: { url: string; anonKey: string; serviceKey: string; signingSecret: string; mailUrl: string };
  storage: { endpoint: string; bucket: string; region: string; credentials: { accessKeyId: string; secretAccessKey: string } };
  media: { toolchainDirectory: string; dockerPath: string; files: Record<'png' | 'jpeg' | 'video' | 'poster', string> };
};
export type StackAccount = { id: string; email: string; password: string; nextPassword: string };

const jwt = (role: string, secret: string) => {
  const now = Math.floor(Date.now() / 1000);
  const value = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: now, exp: now + 3600 })).toString('base64url')}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
};

/** The standard Supabase `/auth/v1` path and browser CORS in front of GoTrue, in process instead of a gateway container. */
async function startAuthProxy(origins: readonly string[]) {
  let upstream = 0;
  const server: Server = createServer((request, response) => {
    const origin = request.headers.origin;
    const cors: Record<string, string> = origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (!request.url?.startsWith('/auth/v1/') || !upstream) { response.writeHead(404, cors).end(); return; }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': corsHeaders }).end();
      return;
    }
    const proxied = forward({ host: '127.0.0.1', port: upstream, method: request.method, path: request.url.slice('/auth/v1'.length), headers: { ...request.headers, host: `127.0.0.1:${upstream}` } }, reply => {
      // The proxy decides the allowed browser origin, replacing GoTrue's wildcard; GoTrue's exposed headers (its API version) pass through.
      const headers = Object.fromEntries(Object.entries(reply.headers).filter(([name]) => !['access-control-allow-origin', 'access-control-allow-credentials', 'vary'].includes(name)));
      response.writeHead(reply.statusCode ?? 502, { ...headers, ...cors });
      reply.pipe(response);
    });
    // A stalled GoTrue fails fast as a gateway timeout instead of hanging the browser until the test timeout.
    proxied.setTimeout(5000, () => { if (!response.headersSent) response.writeHead(504, cors); response.end(); proxied.destroy(); });
    proxied.on('error', () => { if (!response.headersSent) response.writeHead(502, cors); response.end(); });
    request.pipe(proxied);
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Auth proxy has no TCP address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    route(port: number) { upstream = port; },
    close: () => new Promise<void>((done, fail) => { server.closeAllConnections(); server.close(error => error ? fail(error) : done()); }),
  };
}

/**
 * One shared stack per test run: Postgres, GoTrue, Mailpit and S3 storage (four containers), plus media fixtures generated once.
 * Tests isolate through their own database, accounts and object keys. Returns the private stack file path for child processes.
 */
export async function startTestStack(options: { browserOrigins: readonly string[] }) {
  if (!options.browserOrigins.length || options.browserOrigins.some(value => {
    try { const url = new URL(value); return url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin !== value; }
    catch { return true; }
  })) throw new Error('Test stack browser origins must be exact loopback HTTP origins');
  const resources = new AuthFixtureResources();
  const directory = join(process.cwd(), 'outputs', 'fixtures', 'stack', resources.owner);
  const cleanups: (() => unknown)[] = [];
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    clearTimeout(lifetime);
    const errors: unknown[] = [];
    for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, 'Test stack cleanup failed');
  })();
  // The owner's later close() returns this same promise and reports any cleanup failure.
  const lifetime = setTimeout(() => { close().catch(() => undefined); }, stackLifetimeMs); lifetime.unref();
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 }); cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const proxy = await startAuthProxy(options.browserOrigins); cleanups.push(proxy.close);
    const storage = await isolatedObjectStorage(options.browserOrigins); cleanups.push(storage.close);
    cleanups.push(() => resources.closeNetwork());
    await resources.createNetwork();
    const database = await isolatedPostgres({ network: { name: resources.edgeNetworkName, owner: resources.owner } }); cleanups.push(database.close);
    await resources.attachPrivate(database.containerId, database.owner, 'database');
    // GoTrue owns every table/migration in its own database; tests never touch it.
    const cluster = new URL(database.adminUrl); cluster.pathname = '/postgres';
    await query(cluster.href, 'CREATE DATABASE gotrue');
    await query(cluster.href, 'REVOKE ALL ON DATABASE gotrue FROM PUBLIC');
    const gotrue = new URL(cluster); gotrue.pathname = '/gotrue';
    await query(gotrue.href, 'CREATE SCHEMA auth AUTHORIZATION postgres');
    gotrue.hostname = 'database'; gotrue.port = '5432'; gotrue.searchParams.set('search_path', 'auth');
    const signingSecret = randomBytes(48).toString('hex');
    const anonKey = jwt('anon', signingSecret), serviceKey = jwt('service_role', signingSecret);
    cleanups.push(() => resources.closeContainers());
    // Recovery tests consume the link GoTrue actually emails: a PKCE link carries the browser's code challenge, which an admin-generated link cannot.
    const mail = await resources.run('mail', images.mail, ['--publish', '127.0.0.1::8025', '--tmpfs', '/tmp:rw,nosuid,size=67108864'], {
      MP_SMTP_BIND_ADDR: '0.0.0.0:1025', MP_UI_BIND_ADDR: '0.0.0.0:8025', MP_DATABASE: '/tmp/mailpit.db', MP_MAX_MESSAGES: '500',
    });
    const mailUrl = `http://127.0.0.1:${await resources.port(mail, 8025)}`;
    const auth = await resources.run('gotrue', images.auth, ['--publish', '127.0.0.1::9999'], {
      API_EXTERNAL_URL: proxy.url, GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: gotrue.href,
      GOTRUE_SITE_URL: options.browserOrigins[0]!, GOTRUE_URI_ALLOW_LIST: options.browserOrigins.map(origin => origin + '/auth/callback').join(','),
      GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_EXTERNAL_PHONE_ENABLED: 'false', GOTRUE_MAILER_AUTOCONFIRM: 'false',
      GOTRUE_JWT_SECRET: signingSecret, GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_EXP: '300',
      GOTRUE_SMTP_HOST: 'mail', GOTRUE_SMTP_PORT: '1025', GOTRUE_SMTP_ADMIN_EMAIL: 'auth@fixture.invalid', GOTRUE_SMTP_SENDER_NAME: 'Workprint test stack', GOTRUE_SMTP_MAX_FREQUENCY: '1s',
      GOTRUE_MAILER_OTP_EXP: '300', GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000', GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '10000', GOTRUE_RATE_LIMIT_VERIFY: '10000', GOTRUE_RATE_LIMIT_OTP: '10000',
      GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify',
    });
    proxy.route(await resources.port(auth, 9999));
    const deadline = Date.now() + 45000;
    for (;;) {
      try {
        if ((await fetch(proxy.url + '/auth/v1/health', { signal: AbortSignal.timeout(1000) })).ok && (await fetch(mailUrl + '/api/v1/info', { signal: AbortSignal.timeout(1000) })).ok) break;
      } catch { /* Services are not ready; bounded below. */ }
      if (Date.now() > deadline) throw new Error('Test stack Auth/mail startup deadline exceeded');
      await delay(100);
    }
    const media = { toolchainDirectory: resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`), dockerPath: await realpath('/usr/local/bin/docker') };
    const sandbox = await createMediaSandbox(media);
    const files = { png: join(directory, 'image.png'), jpeg: join(directory, 'image.jpg'), video: join(directory, 'clip.mp4'), poster: join(directory, 'poster.png') };
    try {
      const generated = await qualifiedMediaFixtures(sandbox, media.dockerPath);
      if (!generated.progress.toString().includes('progress=end')) throw new Error('Generated fixture clip did not decode completely');
      const poster = await qualifiedPoster(sandbox, media.dockerPath, generated.video);
      await Promise.all([writeFile(files.png, generated.png), writeFile(files.jpeg, generated.jpeg), writeFile(files.video, generated.video), writeFile(files.poster, poster)]);
    } finally { await sandbox.close(); }
    const record: StackRecord = {
      postgres: { adminUrl: cluster.href, setupPassword: new URL(database.setupUrl).password, servingPassword: new URL(database.servingUrl).password },
      auth: { url: proxy.url, anonKey, serviceKey, signingSecret, mailUrl },
      storage: { endpoint: storage.endpoint, bucket: storage.bucket, region: 'us-east-1', credentials: storage.credentials },
      media: { ...media, files },
    };
    const file = join(directory, 'stack.private.json');
    await writeFile(file, JSON.stringify(record), { flag: 'wx', mode: 0o600 }); await chmod(file, 0o600);
    return { file, close };
  } catch (error) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Test stack startup and cleanup failed', { cause: cleanupError }); }
    throw error;
  }
}

let cached: ReturnType<typeof consumer> | undefined;
/** The running shared stack, as published by `scripts/test-stack.mjs`. */
export function testStack() {
  return cached ??= consumer();
}

export type TestDatabase = Awaited<ReturnType<ReturnType<typeof consumer>['testDatabase']>>;

function consumer() {
  const file = process.env.WORKPRINT_TEST_STACK;
  if (!file) throw new Error('No test stack: run through `node scripts/test-stack.mjs <command>` (pnpm test and test:browser do this)');
  const record = JSON.parse(readFileSync(file, 'utf8')) as StackRecord;
  const { url, anonKey, serviceKey } = record.auth;
  const request = (path: string, body?: unknown, token?: string, method?: string) => fetch(`${url}/auth/v1/${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000), redirect: 'manual',
  });
  const files = record.media.files;
  const accounts = new Set<string>(), seenMessages = new Set<string>();
  return {
    /**
     * A fresh `workprint` application database (the name `pnpm db:migrate` requires); close drops it.
     * Test files run one at a time, so a database left by an aborted file is replaced, not shared.
     */
    async testDatabase() {
      await query(record.postgres.adminUrl, 'DROP DATABASE IF EXISTS workprint WITH (FORCE)');
      const database = await applicationDatabase(record.postgres.adminUrl, 'workprint', record.postgres.setupPassword, record.postgres.servingPassword);
      return { ...database, close: async () => { await query(record.postgres.adminUrl, 'DROP DATABASE IF EXISTS workprint WITH (FORCE)'); } };
    },
    auth: {
      url, anonKey, serviceKey, signingSecret: record.auth.signingSecret, request,
      async createAccount(): Promise<StackAccount> {
        const email = `workprint-${randomUUID()}@fixture.invalid`, password = `A1!${randomBytes(24).toString('hex')}`, nextPassword = `B2!${randomBytes(24).toString('hex')}`;
        const response = await request('admin/users', { email, password, email_confirm: true }, serviceKey);
        if (!response.ok) throw new Error(`Test account creation failed (${response.status})`);
        const value = await response.json() as { id: string; email: string };
        if (!/^[0-9a-f-]{36}$/i.test(value.id) || value.email !== email) throw new Error('Invalid test account response');
        accounts.add(email);
        return { id: value.id, email, password, nextPassword };
      },
      /** The real reset link delivered to an account this process created. */
      recoveryLink(email: string) {
        if (!accounts.has(email)) throw new Error('Refusing mail access for an account not created by this process');
        return capturedRecoveryLink(record.auth.mailUrl, url, email, seenMessages);
      },
    },
    storage: record.storage,
    media: {
      toolchain: { toolchainDirectory: record.media.toolchainDirectory, dockerPath: record.media.dockerPath },
      png: readFileSync(files.png), jpeg: readFileSync(files.jpeg), video: readFileSync(files.video), poster: readFileSync(files.poster),
    },
  };
}
