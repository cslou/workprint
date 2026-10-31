import type { Mastra } from '@mastra/core';
import type { RequestContext } from '@mastra/core/request-context';
import type { WorkflowRun } from '@mastra/core/storage';
import { registerApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { controlledNativeControlProvider } from './native-control-provider.js';
import { nativeWorkflowBudget } from './native-workflow-budget.js';
import { cancelNativeWorkflow, confirmedWorkflowOutcome, NativeCancellationUnconfirmed, terminalWorkflow, workflowSnapshot, type NativeWorkflowIdentity } from './native-workflow-outcome.js';
import { nativeRecoveryDefinition, recoveryWorkflowName } from './native-recovery-definition.js';
import { nativeRecoveryStore, recoveryBoundary, type RecoveryIntent } from './native-recovery-store.js';
import type { RecoveryInstrumentation } from './native-recovery-barrier.js';

/** Separate test composition only; one native engine owns every execution and restart. */
export function controlledNativeRecoveryProvider(instrumentation: RecoveryInstrumentation) {
  const turns = controlledNativeControlProvider(), budget = nativeWorkflowBudget();
  const admitted = new Set<string>(), dispatched = new Set<string>();
  let mastra: Mastra;
  let startupSweeps = 0;
  const pool = () => {
    const storage = mastra.getStorage();
    if (!(storage instanceof PostgresStore)) throw new Error('Recovery fixture requires public native Postgres pool');
    return storage.pool;
  };
  const fixture = () => nativeRecoveryStore(pool());
  const native = async () => { const value = await mastra.getStorage()?.getStore('workflows'); if (!value) throw new Error('Recovery native storage unavailable'); return value; };
  const read = async (identity: NativeWorkflowIdentity) => (await native()).getWorkflowRunById({ runId: identity.runId, workflowName: identity.workflowName });
  const releaseTerminal = async (identity: NativeWorkflowIdentity) => {
    const row = await read(identity);
    if (!row?.resourceId || (identity.resourceId !== undefined && identity.resourceId !== row.resourceId)) throw new Error('Recovery native terminal identity unavailable');
    await confirmedWorkflowOutcome({ ...identity, resourceId: row.resourceId }, read);
    budget.release(identity.runId); admitted.delete(identity.runId); dispatched.delete(identity.runId);
  };
  const canonical = async (runId: string, logicalId: string, resourceId: string) => {
    const intent = await fixture().get(logicalId, resourceId), row = await (await native()).getWorkflowRunById({ runId });
    if (!intent || intent.runId !== runId || !row || row.workflowName !== recoveryWorkflowName || row.resourceId !== resourceId) throw new Error('Recovery fixture/native identity mismatch');
    return intent;
  };
  const workflow = nativeRecoveryDefinition(budget, instrumentation, canonical, intent => fixture().effect(intent), releaseTerminal);
  const cancel = async (intent: RecoveryIntent) => {
    const row = await (await native()).getWorkflowRunById({ runId: intent.runId });
    if (row && (row.workflowName !== workflow.id || row.resourceId !== intent.resourceId)) throw new Error('Recovery cancellation identity mismatch');
    const run = await workflow.createRun({ runId: intent.runId, resourceId: intent.resourceId });
    await cancelNativeWorkflow({ runId: intent.runId, workflowName: workflow.id, resourceId: intent.resourceId }, () => run.cancel(), read);
    budget.release(intent.runId); admitted.delete(intent.runId); dispatched.delete(intent.runId);
  };
  const waitRemaining = (intent: RecoveryIntent, row?: WorkflowRun | null) => {
    const context = row && workflowSnapshot(row).context;
    const offset = context?.['recovery-late']?.status === 'success' ? 8000 : context?.['recovery-midpoint']?.status === 'success' ? 4000 : 0;
    const deadline = intent.boundary === 'run-deadline' ? intent.committedAt.getTime() + offset + 5000 : intent.waitDeadline.getTime();
    return Math.max(0, Math.min(5000, deadline - Date.now()));
  };
  const admit = (intent: RecoveryIntent, reserved?: ReturnType<typeof budget.reserve>, row?: WorkflowRun | null) => {
    if (admitted.has(intent.runId)) { reserved?.release(); return true; }
    const permit = reserved ?? budget.reserve();
    if (!permit) return false;
    permit.bind(intent.runId, () => cancel(intent), Math.max(0, intent.runDeadline.getTime() - Date.now()));
    admitted.add(intent.runId);
    budget.suspend(intent.runId, waitRemaining(intent, row));
    return true;
  };
  const project = async (runId: string) => {
    const row = await (await native()).getWorkflowRunById({ runId });
    if (!row || row.workflowName !== workflow.id) throw new Error('Recovery native run missing');
    return { runId: row.runId, resourceId: row.resourceId, status: workflowSnapshot(row).status };
  };
  const reconcile = async (resourceId: string) => {
    const records = [];
    for (const intent of await fixture().list(resourceId)) {
      const row = await (await native()).getWorkflowRunById({ runId: intent.runId });
      if (row && (row.workflowName !== workflow.id || row.resourceId !== intent.resourceId)) throw new Error('Recovery native intent binding mismatch');
      if (row && terminalWorkflow(workflowSnapshot(row).status)) { await releaseTerminal({ runId: row.runId, workflowName: workflow.id, resourceId }); records.push(await project(row.runId)); continue; }
      if (!admit(intent)) throw new Error('Recovery fixture admission exceeded');
      const run = await workflow.createRun({ runId: intent.runId, resourceId });
      if (!row || workflowSnapshot(row).status === 'pending') {
        const acknowledgement = await run.startAsync({ inputData: { logicalId: intent.logicalId, resourceId, boundary: intent.boundary,
          wakeAt: new Date(intent.committedAt.getTime() + (intent.boundary === 'run-deadline' ? 4000 : intent.boundary === 'waiting' ? 2500 : 1)).toISOString() } });
        if (acknowledgement.runId !== intent.runId) throw new Error('Native recovery start acknowledged a different run');
        dispatched.add(intent.runId);
      } else if (['running', 'waiting'].includes(workflowSnapshot(row).status) && !dispatched.has(intent.runId)) {
        try { await run.restart(); }
        catch (error) {
          if (!(error instanceof Error) || !('id' in error) || error.id !== 'WORKFLOW_RESTART_RUN_OWNED') throw error;
          await instrumentation.event({ kind: 'native-owned', runId: intent.runId });
        }
      } else if (!dispatched.has(intent.runId)) throw new Error('Recovery native outcome requires explicit handling');
      records.push(await project(intent.runId));
    }
    return records;
  };
  const inflight = new Map<string, ReturnType<typeof reconcile>>();
  const boundedReconcile = (resourceId: string) => {
    const existing = inflight.get(resourceId); if (existing) return existing;
    const work = reconcile(resourceId).finally(() => inflight.delete(resourceId)); inflight.set(resourceId, work); return work;
  };
  const schema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('start'), logicalId: z.uuid(), boundary: recoveryBoundary }).strict(),
    z.object({ action: z.literal('reconcile') }).strict(),
    z.object({ action: z.literal('cancel'), logicalId: z.uuid() }).strict(),
  ]);
  const handler = async (context: Context) => {
    const resourceId: unknown = (context.get('requestContext') as RequestContext).get('accountId');
    if (typeof resourceId !== 'string') return context.json({ missing: true }, 401);
    const parsed = schema.safeParse(await context.req.json()); if (!parsed.success) return context.json({ invalid: true }, 400);
    try {
      if (parsed.data.action === 'start') {
        const permit = budget.reserve(); if (!permit) return context.json({ error: { code: 'capacity_exceeded' } }, 429);
        let intent: RecoveryIntent;
        try { intent = await fixture().put(parsed.data.logicalId, randomUUID(), resourceId, parsed.data.boundary); }
        catch (error) { permit.release(); throw error; }
        if (!admit(intent, permit)) throw new Error('Recovery fixture reservation missing');
        await instrumentation.event({ kind: 'intent', runId: intent.runId });
        await instrumentation.barrier('committed-before-start', intent.runId);
        const result = await boundedReconcile(resourceId);
        if (intent.boundary === 'started-before-ack') await instrumentation.barrier('started-before-ack', intent.runId);
        return context.json({ runId: intent.runId, records: result });
      }
      if (parsed.data.action === 'cancel') {
        const intent = await fixture().get(parsed.data.logicalId, resourceId); if (!intent) return context.json({ missing: true }, 404);
        await canonical(intent.runId, intent.logicalId, resourceId); await cancel(intent); return context.json(await project(intent.runId));
      }
      return context.json(await boundedReconcile(resourceId));
    } catch (error) {
      if (error instanceof NativeCancellationUnconfirmed) return context.json({ error: { code: error.code } }, 503);
      throw error;
    }
  };
  return { ...turns,
    routes: [...turns.routes, registerApiRoute('/recovery-test/control', { method: 'POST', handler }),
      registerApiRoute('/recovery-test/state', { method: 'GET', handler: context => context.json({ pid: process.pid, startupSweeps, budget: budget.state(), inflight: inflight.size,
        pool: { total: pool().totalCount, idle: pool().idleCount, waiting: pool().waitingCount } }) })],
    configure: (instance: Mastra) => {
      mastra = instance; turns.configure(instance); instance.addWorkflow(workflow);
      const recover = instance.restartAllActiveWorkflowRuns.bind(instance);
      instance.restartAllActiveWorkflowRuns = async () => { startupSweeps++; await recover(); };
    },
    beforeRecovery: async () => {
      for (const intent of await fixture().list()) {
        const row = await (await native()).getWorkflowRunById({ runId: intent.runId });
        if (row && (row.workflowName !== workflow.id || row.resourceId !== intent.resourceId)) throw new Error('Recovery priming identity mismatch');
        if ((!row || !terminalWorkflow(workflowSnapshot(row).status)) && !admit(intent, undefined, row)) throw new Error('Recovery priming exceeds two native permits');
      }
    },
    beforeNativeShutdown: async () => {
      for (const intent of await fixture().list()) {
        const row = await (await native()).getWorkflowRunById({ runId: intent.runId });
        if (!row || !terminalWorkflow(workflowSnapshot(row).status)) await cancel(intent);
        else await releaseTerminal({ runId: row.runId, workflowName: workflow.id, resourceId: intent.resourceId });
      }
      if (budget.state().active || budget.state().timers || inflight.size) throw new Error('Recovery fixture did not settle before shutdown');
      console.info(JSON.stringify({ event: 'native-recovery-settled', ...budget.state() }));
    },
  };
}
