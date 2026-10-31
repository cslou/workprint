import { createStep, createWorkflow, type WorkflowOptions } from '@mastra/core/workflows';
import { z } from 'zod';
import type { NativeWorkflowBudget } from './native-workflow-budget.js';
import { workflowFixtureLimits } from './native-workflow-budget.js';
import { terminalWorkflow, type NativeWorkflowIdentity } from './native-workflow-outcome.js';

/** Definitions and external-wait gates exist only in the isolated test build. */
export function nativeWorkflowDefinition(budget: NativeWorkflowBudget, releaseTerminal: (identity: NativeWorkflowIdentity) => Promise<void>) {
  const gates = new Map<string, () => void>();
  const events: { kind: string; runId: string; progress?: number }[] = [];
  let active = 0, listeners = 0, timers = 0, entered = 0, aborted = 0, timedOut = 0;
  const options: WorkflowOptions = { shouldPersistSnapshot: () => true, onFinish: async result => {
    if (result.status === 'suspended') budget.suspend(result.runId);
    else if (terminalWorkflow(result.status)) await releaseTerminal({ runId: result.runId, workflowName: result.workflowId, resourceId: result.resourceId });
  } };
  const input = z.object({ kind: z.enum(['held', 'suspend', 'failure']), waitMs: z.number().int().min(1).max(workflowFixtureLimits.waitMs) });
  const output = z.object({ progress: z.number().int() });
  const work = createStep({ id: 'qualification-work', inputSchema: input, outputSchema: output, resumeSchema: z.object({ proceed: z.boolean() }), suspendSchema: z.object({ waiting: z.boolean() }), retries: 0,
    execute: async ({ inputData, resumeData, suspend, runId, abortSignal }) => {
      entered++; events.push({ kind: 'entered', runId, progress: 1 });
      if (inputData.kind === 'failure') throw new Error('Controlled native workflow failure');
      if (inputData.kind === 'suspend' && !resumeData) return suspend({ waiting: true });
      if (inputData.kind === 'held') await new Promise<void>((resolve, reject) => {
        active++;
        let done = false;
        const finish = (kind: string) => {
          if (done) return false;
          done = true; active--; timers--; clearTimeout(timer);
          abortSignal.removeEventListener('abort', stop); listeners--; gates.delete(runId);
          events.push({ kind, runId }); return true;
        };
        const stop = () => { if (finish('aborted')) { aborted++; reject(abortSignal.reason ?? new Error('Native workflow canceled')); } };
        const timer = setTimeout(() => { if (finish('wait-timeout')) { timedOut++; reject(new Error('Native fixture wait deadline exceeded')); } }, inputData.waitMs);
        timers++; gates.set(runId, () => { if (finish('released')) resolve(); });
        listeners++; abortSignal.addEventListener('abort', stop, { once: true });
        if (abortSignal.aborted) stop();
      });
      events.push({ kind: 'completed', runId, progress: 2 }); return { progress: 2 };
    },
  });
  const controlled = createWorkflow({ id: 'qualification-native-workflow', inputSchema: input, outputSchema: output, retryConfig: { attempts: 0, delay: 0 }, options }).then(work).commit();
  const sleepData = z.object({ waitMs: z.number().int().min(1).max(workflowFixtureLimits.waitMs), progress: z.number().int().min(0).max(3).default(0) });
  const mark = (id: string, progress: number) => createStep({ id, inputSchema: sleepData, outputSchema: sleepData, execute: async ({ inputData, runId }) => {
    events.push({ kind: 'native-progress', runId, progress }); return { ...inputData, progress };
  } });
  const sleeping = createWorkflow({ id: 'qualification-native-sleep', inputSchema: sleepData, outputSchema: sleepData, options })
    .then(mark('sleep-start', 0)).sleep(async ({ inputData }) => inputData.waitMs).then(mark('sleep-end', 1)).commit();
  const deadline = createWorkflow({ id: 'qualification-native-deadline', inputSchema: sleepData, outputSchema: sleepData, options })
    .then(mark('deadline-start', 0)).sleep(4000).then(mark('deadline-first', 1)).sleep(4000).then(mark('deadline-second', 2)).sleep(4000).then(mark('deadline-end', 3)).commit();
  return { controlled, sleeping, deadline,
    release: (runId: string) => { const release = gates.get(runId); if (!release) return false; release(); return true; },
    state: () => ({ active, listeners, timers, entered, aborted, timedOut, gates: [...gates.keys()], events: [...events], budget: budget.state() }),
  };
}
export type NativeWorkflowState = ReturnType<ReturnType<typeof nativeWorkflowDefinition>['state']>;
