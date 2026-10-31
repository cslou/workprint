import type { Mastra } from '@mastra/core';
import type { RequestContext } from '@mastra/core/request-context';
import { registerApiRoute } from '@mastra/core/server';
import type { WorkflowRun } from '@mastra/core/storage';
import { PostgresStore } from '@mastra/pg';
import type { Context } from 'hono';
import { z } from 'zod';
import { nativeWorkflowBudget, workflowFixtureLimits } from './native-workflow-budget.js';
import { nativeWorkflowDefinition } from './native-workflow-definition.js';
import { controlledNativeControlProvider } from './native-control-provider.js';
import { cancelNativeWorkflow, confirmedWorkflowOutcome, NativeCancellationUnconfirmed, terminalWorkflow, workflowSnapshot, type NativeWorkflowIdentity } from './native-workflow-outcome.js';
export { workflowSnapshot } from './native-workflow-outcome.js';

export const workflowFixtureNames = ['qualification-native-workflow', 'qualification-native-sleep', 'qualification-native-deadline'] as const;
export const workflowRecord = (run: WorkflowRun) => {
  const snapshot = workflowSnapshot(run);
  return { runId: run.runId, resourceId: run.resourceId, workflowName: run.workflowName, status: snapshot.status, result: snapshot.result,
    steps: snapshot.context, errorName: snapshot.error?.name };
};
export type NativeWorkflowRecord = ReturnType<typeof workflowRecord>;

/** Separate build input only. Native snapshots, not permits or caller claims, authorize controls. */
export function controlledNativeWorkflowProvider() {
  const turns = controlledNativeControlProvider();
  const budget = nativeWorkflowBudget();
  let mastra: Mastra | undefined;
  const startSchema = z.object({ action: z.literal('start'), kind: z.enum(['held', 'suspend', 'failure', 'sleep', 'deadline']),
    waitMs: z.number().int().min(1).max(workflowFixtureLimits.waitMs).default(workflowFixtureLimits.waitMs), resourceId: z.uuid().optional() }).strict();
  const controlSchema = z.object({ action: z.enum(['read', 'cancel', 'resume', 'release']), runId: z.uuid() }).strict();
  const storage = async () => {
    const store = await mastra?.getStorage()?.getStore('workflows');
    if (!store) throw new Error('Native workflow fixture storage unavailable');
    return store;
  };
  const readOutcome = async (identity: NativeWorkflowIdentity) => (await storage()).getWorkflowRunById({ runId: identity.runId, workflowName: identity.workflowName });
  const releaseTerminal = async (identity: NativeWorkflowIdentity) => { await confirmedWorkflowOutcome(identity, readOutcome); budget.release(identity.runId); };
  const cancel = async (identity: NativeWorkflowIdentity, request: () => Promise<void>) => { await cancelNativeWorkflow(identity, request, readOutcome); budget.release(identity.runId); };
  const definition = nativeWorkflowDefinition(budget, releaseTerminal);
  const workflows = [definition.controlled, definition.sleeping, definition.deadline];
  const poolState = () => {
    const store = mastra?.getStorage();
    if (!(store instanceof PostgresStore)) throw new Error('Native workflow fixture requires the public Postgres pool');
    const pool = store.pool;
    return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
  };
  const handler = async (context: Context) => {
    const account: unknown = (context.get('requestContext') as RequestContext).get('accountId');
    if (typeof account !== 'string') return context.json({ missing: true }, 401);
    const body: unknown = await context.req.json();
    const start = startSchema.safeParse(body);
    if (start.success) {
      if (start.data.resourceId !== undefined && start.data.resourceId !== account) return context.json({ invalid: true }, 400);
      const permit = budget.reserve();
      if (!permit) return context.json({ error: { code: 'capacity_exceeded' } }, 429);
      const { kind, waitMs } = start.data;
      const workflow = kind === 'sleep' ? definition.sleeping : kind === 'deadline' ? definition.deadline : definition.controlled;
      let cancelStarted: (() => Promise<void>) | undefined;
      try {
        const run = await workflow.createRun({ resourceId: account });
        cancelStarted = () => cancel({ runId: run.runId, workflowName: workflow.id, resourceId: account }, () => run.cancel());
        permit.bind(run.runId, cancelStarted);
        const ack = await run.startAsync({ inputData: { kind: kind === 'suspend' || kind === 'failure' ? kind : 'held', waitMs, progress: 0 } });
        return context.json({ runId: run.runId, resourceId: run.resourceId, ack });
      } catch (error) {
        if (cancelStarted) await cancelStarted();
        else permit.release();
        throw error;
      }
    }
    const control = controlSchema.safeParse(body);
    if (!control.success) return context.json({ invalid: true }, 400);
    const { action, runId } = control.data;
    const store = await storage();
    const row = await store.getWorkflowRunById({ runId });
    if (!row || row.resourceId !== account || !workflows.some(workflow => workflow.id === row.workflowName)) return context.json({ missing: true }, 404);
    const workflow = workflows.find(workflow => workflow.id === row.workflowName)!;
    if (action === 'release') {
      if (!definition.release(runId)) return context.json({ missing: true }, 404);
    } else if (action === 'cancel') {
      const run = await workflow.createRun({ runId, resourceId: account });
      await cancel({ runId, workflowName: workflow.id, resourceId: account }, () => run.cancel());
    } else if (action === 'resume') {
      if (workflow !== definition.controlled || workflowSnapshot(row).status !== 'suspended') return context.json({ invalid: true }, 400);
      budget.resume(runId);
      const run = await definition.controlled.createRun({ runId, resourceId: account });
      await run.resume({ step: 'qualification-work', resumeData: { proceed: true } });
    }
    const current = await store.getWorkflowRunById({ runId });
    if (!current) throw new Error('Native workflow fixture lost its saved run');
    return context.json(workflowRecord(current));
  };
  const guardedHandler = async (context: Context) => {
    try { return await handler(context); }
    catch (error) {
      if (error instanceof NativeCancellationUnconfirmed) return context.json({ error: { code: error.code } }, 503);
      throw error;
    }
  };
  return { ...turns,
    routes: [...turns.routes, registerApiRoute('/workflow-test/control', { method: 'POST', handler: guardedHandler }),
      registerApiRoute('/workflow-test/state', { method: 'GET', handler: context => context.json({ ...definition.state(), pid: process.pid, pool: poolState() }) })],
    beforeNativeShutdown: async () => {
      const result = await (await storage()).listWorkflowRuns({ page: 0, perPage: 100 });
      if (result.total !== result.runs.length) throw new Error('Native shutdown fixture workflow page incomplete');
      const settled = await Promise.allSettled(result.runs.map(async row => {
        const workflow = workflows.find(value => value.id === row.workflowName);
        if (!workflow || terminalWorkflow(workflowSnapshot(row).status)) return;
        if (!row.resourceId) throw new Error('Owned native workflow has no saved resource identity');
        const run = await workflow.createRun({ runId: row.runId, resourceId: row.resourceId });
        await cancel({ runId: row.runId, workflowName: workflow.id, resourceId: row.resourceId }, () => run.cancel());
      }));
      const failures = settled.filter(value => value.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(value => value.reason), 'Owned native workflow shutdown failed');
      const state = definition.state();
      if (state.active || state.listeners || state.timers || state.budget.active || state.budget.timers) throw new Error('Owned native workflow handles did not settle before shutdown');
      console.info(JSON.stringify({ event: 'native-workflow-settled', waits: state.active, listeners: state.listeners, timers: state.timers, permits: state.budget.active, budgetTimers: state.budget.timers }));
    },
    configure: (instance: Mastra) => {
      mastra = instance; turns.configure(instance);
      for (const workflow of workflows) instance.addWorkflow(workflow);
    },
  };
}
