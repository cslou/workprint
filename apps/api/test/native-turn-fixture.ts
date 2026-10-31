import { PostgresStore } from '@mastra/pg';
import { randomUUID } from 'node:crypto';
import { MastraClient } from '@mastra/client-js';
import { access, readFile, writeFile } from 'node:fs/promises';
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
import { prepareNativeRecovery } from './native-recovery-setup.js';
import { nativeRecoveryStore, type RecoveryIntent } from './native-recovery-store.js';
import type { RecoveryEvent } from './native-recovery-barrier.js';
import { setTimeout as delay } from 'node:timers/promises';

export async function nativeTurnFixture(options: { control?: boolean; workflows?: boolean; recovery?: boolean; workflowResumeBoundary?: 'createRun' | 'resume' } = {}) {
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
    if (options.recovery) await prepareNativeRecovery(db.setupUrl);
    const env = await environment(); cleanups.push(env.noNetwork);
    const base = await buildServerComposition(env.logs, 'native-turns', undefined, env.env);
    const project = resolve(dirname(base), '../..'); const entry = join(project, 'turn-entry.mjs');
    const provider = options.recovery ? ['native-recovery-provider', 'controlledNativeRecoveryProvider'] : options.workflows ? ['native-workflow-provider', 'controlledNativeWorkflowProvider'] : options.control ? ['native-control-provider', 'controlledNativeControlProvider'] : ['native-turn-provider', 'controlledTurnProvider'];
    const resumeEntered = join(env.logs, 'workflow-resume-entered'), resumeRelease = join(env.logs, 'workflow-resume-release');
    const resumeOptions = options.workflowResumeBoundary ? `{ beforeResume: async phase => {
      if (phase !== ${JSON.stringify(options.workflowResumeBoundary)}) return;
      await writeFile(${JSON.stringify(resumeEntered)}, phase, { mode: 0o600 });
      const end = performance.now() + 2000;
      while (!await access(${JSON.stringify(resumeRelease)}).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) {
        if (performance.now() >= end) throw new Error('Native resume boundary watchdog exceeded');
        await delay(10);
      }
    } }` : '';
    const recoveryControl = join(env.logs, 'recovery-control.json'), recoveryEvents = join(env.logs, 'recovery-events.jsonl');
    if (options.recovery) { await writeFile(recoveryControl, JSON.stringify({ phase: 'released' }), { mode: 0o600 }); await writeFile(recoveryEvents, '', { mode: 0o600 }); }
    const providerOptions = options.recovery ? `recoveryInstrumentation(${JSON.stringify(recoveryControl)}, ${JSON.stringify(recoveryEvents)})` : resumeOptions;
    await writeFile(entry, `
      import { recoveryInstrumentation } from ${JSON.stringify(pathToFileURL(join(root, 'apps/api/.test-build/test/native-recovery-barrier.js')).href)};
      import { access, writeFile } from 'node:fs/promises';
      import { setTimeout as delay } from 'node:timers/promises';
      import {${provider[1]} as createProvider} from ${JSON.stringify(pathToFileURL(join(root, `apps/api/.test-build/test/${provider[0]}.js`)).href)};
      import {createBackend} from './src/mastra/backend.js';
      import {startServer} from './src/mastra/server.js';
      const probe=createProvider(${providerOptions});
      const mastra=await createBackend(probe.routes,probe.model);
      probe.instrument(mastra.getAgent('assistant'));
      probe.configure?.(mastra);
      await probe.beforeRecovery?.();
      await startServer(mastra,[probe.beforeMastra],probe.beforeNativeShutdown);
    `);
    const boot = async () => {
      const value = await startAuthServer(entry, env.env, { url: auth.url, anonKey: auth.anonKey, servingUrl: db.servingUrl, accounts: [] }, join(env.logs, 'native-turn-http.log'),
        { env: { WORKPRINT_BROWSER_ORIGIN: 'http://127.0.0.1:4180', ...(options.recovery ? { MASTRA_AGENT_THREAD_LEASE_TTL_MS: '1000' } : {}) } });
      cleanups.push(value.server.stop); return value;
    };
    let serving = await boot();
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
    return { auth, users, get origin() { return serving.origin; }, close, logs: env.logs, state, request, get exited() { return serving.server.exited; },
      restart: async () => { await serving.server.exited; serving = await boot(); return serving.server.pid; },
      stopServing: async () => { const began = performance.now(); await serving.server.stop(); return { ...serving.server.termination, milliseconds: performance.now() - began }; },
      crash: async () => {
        const pid = serving.server.pid; process.kill(pid, 'SIGKILL'); await serving.server.exited;
        if (serving.server.termination?.signal !== 'SIGKILL') throw new Error('Owned fixture did not exit from actual SIGKILL');
        return { pid, ...serving.server.termination };
      },
      recoveryBarrier: (phase: RecoveryIntent['boundary'] | 'released' | 'reconcile-listed') => writeFile(recoveryControl, JSON.stringify({ phase }), { mode: 0o600 }),
      recoveryEvents: async () => (await readFile(recoveryEvents, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as RecoveryEvent),
      recoveryIntents: () => nativeRecoveryStore(store.pool).list(),
      recoveryEffects: async () => (await store.pool.query<{ logical_id: string; run_id: string }>('SELECT logical_id,run_id FROM qualification.effect ORDER BY logical_id')).rows,
      recoveryOwnership: async (runId: string) => { const workflows = await store.getStore('workflows'); if (!workflows) throw new Error('Native workflow store unavailable'); return workflows.getRunOwnership({ runId }); },
      recoveryPreparationDenied: async () => {
        try { await query(db.servingUrl, 'CREATE SCHEMA serving_must_not_prepare'); return false; }
        catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === '42501') return true; throw new Error('Unexpected recovery serving-role check failure', { cause: error }); }
      },
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
      workflowResumeReached: () => access(resumeEntered).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; }),
      releaseWorkflowResume: () => writeFile(resumeRelease, '', { mode: 0o600 }),
      workflowReadability: (enabled: boolean) => query(db.setupUrl, enabled
        ? 'GRANT SELECT ON ALL TABLES IN SCHEMA mastra TO wp_serving'
        : 'REVOKE SELECT ON ALL TABLES IN SCHEMA mastra FROM wp_serving'),
      workflowPersistence: (enabled: boolean) => query(db.setupUrl, enabled
        ? 'GRANT UPDATE ON ALL TABLES IN SCHEMA mastra TO wp_serving'
        : 'REVOKE UPDATE ON ALL TABLES IN SCHEMA mastra FROM wp_serving'),
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
        const production = await startAuthServer(base, env.env, { url: auth.url, anonKey: auth.anonKey, servingUrl: db.servingUrl, accounts: [] }, join(env.logs, 'native-production-http.log'), { env: { WORKPRINT_TURN_TEST_PROVIDER: '1', WORKPRINT_WORKFLOW_TEST_PROVIDER: '1', WORKPRINT_RECOVERY_TEST_PROVIDER: '1', WORKPRINT_ENABLE_INFERENCE: '1' } });
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
