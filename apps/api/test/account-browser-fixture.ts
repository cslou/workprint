import { PostgresStore } from '@mastra/pg';
import { join } from 'node:path';
import { isolatedAuth } from './isolated-auth.js';
import { isolatedPostgres } from './postgres.js';
import { environment } from './environment.js';
import { buildServerComposition } from './built-server.js';
import { startAuthServer } from './auth-server.js';
import { createNativeConversation } from './native-conversations.js';
import { failFixtureAcquisition, type AcquisitionPhase, type FixtureResource } from './fixture-diagnostics.js';

/** Test-only real backend + isolated Auth. Native data uses existing supported fixture, no new route. */
export async function accountBrowserFixture(options: Parameters<typeof isolatedAuth>[0] = {}, browserOrigin = 'http://127.0.0.1:4180') {
  const auth = await isolatedAuth(options);
  const cleanups: (() => Promise<unknown>)[] = [auth.close];
  const close = async () => {
    const errors: unknown[] = [];
    for (const cleanup of [...cleanups].reverse()) { try { await cleanup(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, 'Account browser fixture cleanup failed');
  };
  let phase: AcquisitionPhase = 'postgres-acquisition';
  const owned: FixtureResource[] = [];
  try {
    const db = await isolatedPostgres(); cleanups.push(db.close);
    owned.push({ owner: db.owner, containerId: db.containerId });
    const store = new PostgresStore({ id: 'account-browser-fixture', connectionString: db.setupUrl, schemaName: 'mastra' }); cleanups.push(() => store.close());
    phase = 'storage-init';
    await store.init();
    phase = 'storage-grants';
    await db.grantServing();
    phase = 'backend-startup';
    const env = await environment();
    const entry = await buildServerComposition(env.logs, 'account-browser', undefined, env.env);
    const server = await startAuthServer(entry, env.env, { url: auth.url, anonKey: auth.anonKey, servingUrl: db.servingUrl, accounts: [] }, join(env.logs, 'account-api.log'), { env: { WORKPRINT_BROWSER_ORIGIN: browserOrigin } });
    cleanups.push(server.server.stop); cleanups.push(env.noNetwork);
    return { auth, apiOrigin: server.origin, close,
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
  } catch (error) { return failFixtureAcquisition(error, phase, owned, close); }
}
