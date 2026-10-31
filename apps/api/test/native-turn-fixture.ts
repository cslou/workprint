import { PostgresStore } from '@mastra/pg';
import { randomUUID } from 'node:crypto';
import { MastraClient } from '@mastra/client-js';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatedAuth } from './isolated-auth.js';
import { isolatedPostgres, query } from './postgres.js';
import { environment, root } from './environment.js';
import { buildServerComposition } from './built-server.js';
import { startAuthServer } from './auth-server.js';
import { createNativeConversation } from './native-conversations.js';
import type { TurnMode } from './native-turn-provider.js';
import { createNativeTextMemory } from '../src/agent/mastra/native-text-memory.js';
import { nativeTurnLimits } from '../src/agent/index.js';
import { setTimeout as delay } from 'node:timers/promises';

export async function nativeTurnFixture(options: { control?: boolean; workflows?: boolean } = {}) {
  const auth = await isolatedAuth();
  const cleanups: (() => Promise<unknown>)[] = [auth.close];
  const close = async () => {
    const errors: unknown[] = [];
    for (const cleanup of [...cleanups].reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Native turn fixture cleanup failed');
  };
  try {
    const db = await isolatedPostgres(); cleanups.push(db.close);
    const store = new PostgresStore({ id: 'native-turn-fixture', connectionString: db.setupUrl, schemaName: 'mastra' }); cleanups.push(() => store.close());
    await store.init(); await db.grantServing();
    const env = await environment(); cleanups.push(env.noNetwork);
    const base = await buildServerComposition(env.logs, 'native-turns', undefined, env.env);
    const project = resolve(dirname(base), '../..'); const entry = join(project, 'turn-entry.mjs');
    const provider = options.workflows ? ['native-workflow-provider', 'controlledNativeWorkflowProvider'] : options.control ? ['native-control-provider', 'controlledNativeControlProvider'] : ['native-turn-provider', 'controlledTurnProvider'];
    await writeFile(entry, `
      import {${provider[1]} as createProvider} from ${JSON.stringify(pathToFileURL(join(root, `apps/api/.test-build/test/${provider[0]}.js`)).href)};
      import {createBackend} from './src/mastra/backend.js';
      import {startServer} from './src/mastra/server.js';
      const probe=createProvider();
      const mastra=await createBackend(probe.routes,probe.model);
      probe.instrument(mastra.getAgent('assistant'));
      probe.configure?.(mastra);
      await startServer(mastra,[probe.beforeMastra],probe.beforeNativeShutdown);
    `);
    const serving = await startAuthServer(entry, env.env, { url: auth.url, anonKey: auth.anonKey, servingUrl: db.servingUrl, accounts: [] }, join(env.logs, 'native-turn-http.log'), { env: { WORKPRINT_BROWSER_ORIGIN: 'http://127.0.0.1:4180' } });
    cleanups.push(serving.server.stop);
    const users = await Promise.all([auth.createAccount(), auth.createAccount()]);
    const tokens = await Promise.all(users.map(async user => {
      const response = await auth.request('token?grant_type=password', { email: user.email, password: user.password });
      if (response.status !== 200) throw new Error('Native turn private Auth prerequisite failed');
      return (await response.json() as { access_token: string }).access_token;
    }));
    const requestAt = (origin: string, path: string, body?: unknown, who = 0, authenticated = true, browserOrigin?: string) => fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { ...(authenticated ? { Authorization: `Bearer ${tokens[who]!}` } : {}), ...(browserOrigin ? { Origin: browserOrigin } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000),
    });
    const request = (path: string, body?: unknown, who = 0, authenticated = true, browserOrigin?: string) => requestAt(serving.origin, path, body, who, authenticated, browserOrigin);
    const memory = await store.getStore('memory'); if (!memory) throw new Error('Native fixture memory unavailable');
    const state = async () => {
      const response = await request('/turn-test/control');
      if (response.status !== 200) throw new Error('Controlled state unavailable');
      const value = await response.json() as { calls: number; active: number; listeners: number; timers: number; cancelled: number; aborted: number; observers: number; pumps: number; held: number; heldListeners: number; activeRunId: string | null };
      for (const key of ['calls', 'active', 'listeners', 'timers', 'cancelled', 'aborted', 'observers', 'pumps', 'held', 'heldListeners'] as const) if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid controlled counter');
      return value;
    };
    return { auth, users, origin: serving.origin, close, logs: env.logs, state, request, exited: serving.server.exited,
      workflowRuns: async () => {
        const workflows = await store.getStore('workflows'); if (!workflows) throw new Error('Native fixture workflows unavailable');
        const result = await workflows.listWorkflowRuns({ page: 0, perPage: 100 });
        if (result.runs.length !== result.total) throw new Error('Native fixture workflow page incomplete');
        return result.runs;
      },
      accessToken: async (who = 0): Promise<string | null> => tokens[who] ?? null,
      mode: async (mode: TurnMode) => { const response = await request('/turn-test/control', { mode }); if (!response.ok) throw new Error('Controlled mode change rejected'); },
      thread: (who = 0) => createNativeConversation(store, users[who]!.id, [], 'Native turn qualification'),
      nativeRuns: async () => { const workflows = await store.getStore('workflows'); if (!workflows) throw new Error('Native fixture workflows unavailable'); return (await workflows.listWorkflowRuns({ page: 0, perPage: 100 })).runs.length; },
      servingBusy: async () => Number((await query(db.adminUrl, "SELECT count(*) AS busy FROM pg_stat_activity WHERE datname = current_database() AND usename = 'wp_serving' AND state <> 'idle'")).rows[0]?.busy),
      servingConnections: async () => Number((await query(db.adminUrl, "SELECT count(*) AS connections FROM pg_stat_activity WHERE datname = current_database() AND usename = 'wp_serving'")).rows[0]?.connections),
      read: (threadId: string, who = 0) => memory.listMessages({ threadId, resourceId: users[who]!.id, page: 0, perPage: 100, orderBy: { field: 'createdAt', direction: 'ASC' } }),
      snapshot: async () => JSON.stringify({ threads: await memory.listThreads({ page: 0, perPage: 100 }), messages: await memory.listMessages({ threadId: (await memory.listThreads({ page: 0, perPage: 100 })).threads.map(t => t.id), perPage: 1000 }) }),
      sdk: (who = 0, signal: AbortSignal = AbortSignal.timeout(20000)) => new MastraClient({ baseUrl: serving.origin, retries: 0, headers: { Authorization: `Bearer ${tokens[who]!}` }, abortSignal: signal }).getAgent('assistant'),
      navigationSdk: (who = 0) => new MastraClient({ baseUrl: serving.origin, apiPrefix: '', retries: 0, headers: { Authorization: `Bearer ${tokens[who]!}` }, abortSignal: AbortSignal.timeout(5000) }),
      memorySave: (args: Parameters<ReturnType<typeof createNativeTextMemory>['saveMessages']>[0]) => createNativeTextMemory(store).saveMessages(args),
      seedUnsupportedSignal: async (kind: 'notification' | 'forged-user') => {
        const thread = await createNativeConversation(store, users[0]!.id, [], 'Unsupported signal'); const id = randomUUID();
        await memory.saveMessages({ messages: [{ id, threadId: thread.id, resourceId: users[0]!.id, role: 'signal', type: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text: 'Private unsupported signal' }], metadata: { signal: { id: kind === 'forged-user' ? randomUUID() : id, type: kind === 'notification' ? 'notification' : 'user', tagName: kind === 'notification' ? 'notification' : 'user' } } } }] });
        return thread;
      },
      production: async () => {
        await serving.server.stop();
        if (await serving.server.exited !== 0) throw new Error('Controlled serving did not exit cleanly');
        const production = await startAuthServer(base, env.env, { url: auth.url, anonKey: auth.anonKey, servingUrl: db.servingUrl, accounts: [] }, join(env.logs, 'native-production-http.log'), { env: { WORKPRINT_TURN_TEST_PROVIDER: '1', WORKPRINT_WORKFLOW_TEST_PROVIDER: '1', WORKPRINT_ENABLE_INFERENCE: '1' } });
        cleanups.push(production.server.stop);
        return { origin: production.origin, request: (path: string, body?: unknown, who = 0) => requestAt(production.origin, path, body, who) };
      },
    };
  } catch (error) { try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Native turn fixture acquisition failed', { cause: cleanupError }); } throw error; }
}

export async function releasedNativeFixture(fixture: Awaited<ReturnType<typeof nativeTurnFixture>>) {
  const deadline = Date.now() + nativeTurnLimits.executionMs + 500;
  for (;;) {
    const state = await fixture.state();
    if (!state.active && !state.listeners && !state.timers && !state.observers && !state.pumps && !state.held && !state.heldListeners && !state.activeRunId && await fixture.nativeRuns() === 0 && await fixture.servingBusy() === 0) return state;
    if (Date.now() >= deadline) throw new Error('Native provider/observer resources must release');
    await delay(25);
  }
}
