import { PostgresStore } from '@mastra/pg';
import { join } from 'node:path';
import { testStack } from './test-stack.js';
import { environment } from './environment.js';
import { buildServerComposition } from './built-server.js';
import { startAuthServer } from './auth-server.js';
import { applyArtifactMigrations } from './artifact-database.js';
import { createNativeConversation } from './native-conversations.js';
import { failFixtureAcquisition, type AcquisitionPhase } from './fixture-diagnostics.js';
import type { PrivateStorageConfiguration } from '../../src/storage/index.js';

export type AppFixtureOptions = {
  /** Apply application migrations so saved-work operations are served. */
  artifacts?: boolean;
  storage?: PrivateStorageConfiguration;
  media?: { toolchainDirectory: string; dockerPath: string };
  /** Bound the API process to a suite-long lifetime instead of the per-test default. */
  serverLifetimeMs?: number;
};

/** Test-only real backend on the shared stack's Auth and its own database. Native data uses existing supported fixture, no new route. */
export async function accountBrowserFixture(options: AppFixtureOptions = {}, browserOrigin = 'http://127.0.0.1:4180') {
  const { artifacts, storage, media, serverLifetimeMs } = options;
  const { auth, testDatabase } = testStack();
  const cleanups: (() => Promise<unknown>)[] = [];
  const close = async () => {
    const errors: unknown[] = [];
    for (const cleanup of [...cleanups].reverse()) { try { await cleanup(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, 'Account browser fixture cleanup failed');
  };
  let phase: AcquisitionPhase = 'postgres-acquisition';
  try {
    const db = await testDatabase(); cleanups.push(db.close);
    const store = new PostgresStore({ id: 'account-browser-fixture', connectionString: db.setupUrl, schemaName: 'mastra' }); cleanups.push(() => store.close());
    phase = 'storage-init';
    await store.init();
    phase = 'storage-grants';
    await db.grantServing();
    if (artifacts) await applyArtifactMigrations(db.setupUrl);
    phase = 'backend-startup';
    const env = await environment();
    const entry = await buildServerComposition(env.logs, 'account-browser', undefined, env.env);
    const servingEnv = { WORKPRINT_BROWSER_ORIGIN: browserOrigin,
      ...(storage ? { S3_ENDPOINT: storage.endpoint, S3_REGION: storage.region, S3_BUCKET: storage.bucket, S3_ACCESS_KEY_ID: storage.credentials.accessKeyId, S3_SECRET_ACCESS_KEY: storage.credentials.secretAccessKey } : {}),
      ...(media ? { MEDIA_TOOLCHAIN_DIRECTORY: media.toolchainDirectory, MEDIA_DOCKER_PATH: media.dockerPath } : {}) };
    const server = await startAuthServer(entry, env.env, { url: auth.url, anonKey: auth.anonKey, servingUrl: db.servingUrl, accounts: [] }, join(env.logs, 'account-api.log'), { env: servingEnv, ...(serverLifetimeMs ? { lifetimeMs: serverLifetimeMs } : {}) });
    cleanups.push(server.server.stop); cleanups.push(env.noNetwork);
    return { auth, apiOrigin: server.origin, close, native: store, servingUrl: db.servingUrl, setupUrl: db.setupUrl,
      /** A fresh access token for an account this fixture created. */
      accessToken: async (user: { email: string; password: string }) => {
        const response = await auth.request('token?grant_type=password', { email: user.email, password: user.password });
        if (response.status !== 200) throw new Error(`Fixture sign-in failed (${response.status})`);
        return (await response.json() as { access_token: string }).access_token;
      },
      saveNative: async (accountId: string, messages: Parameters<typeof createNativeConversation>[2] = [{ role: 'user', text: 'Synthetic saved work' }], title?: string) => {
        return createNativeConversation(store, accountId, messages, title);
      },
      readNative: async (accountId: string, threadId: string) => {
        const memory = await store.getStore('memory');
        if (!memory) throw new Error('Fixture native memory unavailable');
        return memory.listMessages({ threadId, resourceId: accountId, page: 0, perPage: 1000, orderBy: { field: 'createdAt', direction: 'ASC' } });
      },
      snapshot: async () => {
        const memory = await store.getStore('memory');
        if (!memory) throw new Error('Fixture native memory unavailable');
        const threads = await memory.listThreads({ page: 0, perPage: 100 });
        const ids = threads.threads.map(thread => thread.id);
        return JSON.stringify({ threads, messages: ids.length ? await memory.listMessages({ threadId: ids, perPage: 1000 }) : { messages: [] } });
      },
    };
  } catch (error) { return failFixtureAcquisition(error, phase, [], close); }
}
