import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import type { NativeWorkflowBudget } from './native-workflow-budget.js';
import { terminalWorkflow, type NativeWorkflowIdentity } from './native-workflow-outcome.js';
import type { RecoveryInstrumentation } from './native-recovery-barrier.js';
import { recoveryBoundary, type RecoveryIntent } from './native-recovery-store.js';

export const recoveryWorkflowName = 'qualification-native-recovery';

export function nativeRecoveryDefinition(budget: NativeWorkflowBudget, instrumentation: RecoveryInstrumentation,
  canonical: (runId: string, logicalId: string, resourceId: string) => Promise<RecoveryIntent>,
  effect: (intent: RecoveryIntent) => Promise<number | null>, releaseTerminal: (identity: NativeWorkflowIdentity) => Promise<void>) {
  const data = z.object({ logicalId: z.uuid(), resourceId: z.uuid(), boundary: recoveryBoundary, wakeAt: z.iso.datetime() });
  const output = z.object({ effect: z.boolean() });
  const entered = createStep({ id: 'recovery-entered', inputSchema: data, outputSchema: data, retries: 0,
    execute: async ({ inputData, runId, abortSignal }) => {
      const intent = await canonical(runId, inputData.logicalId, inputData.resourceId);
      budget.suspend(runId, Math.max(0, intent.waitDeadline.getTime() - Date.now()));
      await instrumentation.event({ kind: 'entered', runId });
      if (inputData.boundary === 'started-before-ack') await instrumentation.barrier('started-before-ack', runId, abortSignal);
      return inputData;
    } });
  const guarded = createStep({ id: 'recovery-effect', inputSchema: data, outputSchema: output, retries: 0,
    execute: async ({ inputData, runId, abortSignal }) => {
      const intent = await canonical(runId, inputData.logicalId, inputData.resourceId);
      budget.resume(runId);
      await instrumentation.event({ kind: 'effect-entry', runId });
      const inserted = await effect(intent);
      await instrumentation.event({ kind: 'effect', runId, inserted });
      if (inputData.boundary === 'effect-before-step-ack') {
        budget.suspend(runId, Math.max(0, intent.waitDeadline.getTime() - Date.now()));
        await instrumentation.barrier('effect-before-step-ack', runId, abortSignal);
        budget.resume(runId);
      }
      return { effect: true };
    } });
  const checkpoint = (id: string, offset: number) => createStep({ id, inputSchema: data, outputSchema: data, execute: async ({ inputData, runId }) => {
    if (inputData.boundary === 'run-deadline') {
      const intent = await canonical(runId, inputData.logicalId, inputData.resourceId);
      budget.suspend(runId, Math.max(0, intent.committedAt.getTime() + offset + 5000 - Date.now()));
      await instrumentation.event({ kind: id, runId });
    }
    return inputData;
  } });
  return createWorkflow({ id: recoveryWorkflowName, inputSchema: data, outputSchema: output, retryConfig: { attempts: 0, delay: 0 },
    options: { shouldPersistSnapshot: () => true, onFinish: async result => {
      if (terminalWorkflow(result.status)) await releaseTerminal({ runId: result.runId, workflowName: result.workflowId, resourceId: result.resourceId });
    } } })
    .then(entered).sleepUntil(async ({ inputData }) => new Date(inputData.wakeAt), { id: 'recovery-sleep' })
    .then(checkpoint('recovery-midpoint', 4000))
    .sleepUntil(async ({ inputData }) => new Date(Date.parse(inputData.wakeAt) + (inputData.boundary === 'run-deadline' ? 4000 : 0)), { id: 'recovery-sleep-two' })
    .then(checkpoint('recovery-late', 8000))
    .sleepUntil(async ({ inputData }) => new Date(Date.parse(inputData.wakeAt) + (inputData.boundary === 'run-deadline' ? 8000 : 0)), { id: 'recovery-sleep-three' }).then(guarded).commit();
}
