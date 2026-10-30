import { PostgresStore } from '@mastra/pg';
import { join } from 'node:path';
import { isolatedAuth } from './isolated-auth.js';
import { isolatedPostgres } from './postgres.js';
import { environment } from './environment.js';
import { buildServerComposition } from './built-server.js';
import { startAuthServer } from './auth-server.js';
import { createNativeConversation } from './native-conversations.js';

/** Test-only real backend + isolated Auth. Native data uses existing supported fixture, no new route. */
export async function accountBrowserFixture(options: Parameters<typeof isolatedAuth>[0] = {}) {
  const auth = await isolatedAuth(options);
  const cleanups: (() => Promise<unknown>)[] = [auth.close];
  const close = async () => {
    const errors: unknown[] = [];
    for (const cleanup of [...cleanups].reverse()) { try { await cleanup(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, 'Account browser fixture cleanup failed');
  };
  try {
    const db = await isolatedPostgres(); cleanups.push(db.close);
    const store = new PostgresStore({ id: 'account-browser-fixture', connectionString: db.setupUrl, schemaName: 'mastra' }); cleanups.push(() => store.close());
    await store.init(); await db.grantServing();
    const env = await environment();
    const entry = await buildServerComposition(env.logs, 'account-browser', undefined, env.env);
    const server = await startAuthServer(entry, env.env, { url: auth.url, anonKey: auth.anonKey, servingUrl: db.servingUrl, accounts: [] }, join(env.logs, 'account-api.log'), { env: { WORKPRINT_BROWSER_ORIGIN: 'http://127.0.0.1:4180' } });
    cleanups.push(server.server.stop); cleanups.push(env.noNetwork);
    const threadIds: string[] = [];
    return { auth, apiOrigin: server.origin, close,
      saveNative: async (accountId: string) => {
        const thread = await createNativeConversation(store, accountId, [{ role: 'user', text: 'Synthetic saved work' }]); threadIds.push(thread.id); return thread;
      },
      snapshot: async () => {
        const memory = await store.getStore('memory');
        if (!memory) throw new Error('Fixture native memory unavailable');
        return JSON.stringify({ threads: await memory.listThreads({ page: 0, perPage: 100 }), messages: await memory.listMessages({ threadId: threadIds, perPage: 100 }) });
      },
    };
  } catch (error) { try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Account fixture acquisition failed', { cause: cleanupError }); } throw error; }
}
