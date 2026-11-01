import type { WorkflowRun } from '@mastra/core/storage';
import type { WorkflowRunState } from '@mastra/core/workflows';

export type NativeWorkflowIdentity = { runId: string; workflowName: string; resourceId: string | undefined };
export type NativeWorkflowOutcomeReader = (identity: NativeWorkflowIdentity) => Promise<WorkflowRun | null>;
export const workflowSnapshot = (run: WorkflowRun): WorkflowRunState => typeof run.snapshot === 'string' ? JSON.parse(run.snapshot) as WorkflowRunState : run.snapshot;
export const terminalWorkflow = (status: string) => ['success', 'failed', 'canceled', 'tripwire', 'bailed'].includes(status);

export class NativeCancellationUnconfirmed extends Error {
  readonly code = 'native_cancellation_unconfirmed';
  constructor(cause?: unknown) {
    super('Native workflow cancellation has no confirmed persisted terminal outcome', { cause });
    this.name = 'NativeCancellationUnconfirmed';
  }
}

/** Public native storage is authority; an acknowledgment or callback is not a saved outcome. */
export async function confirmedWorkflowOutcome(identity: NativeWorkflowIdentity, read: NativeWorkflowOutcomeReader): Promise<WorkflowRun> {
  try {
    const row = await read(identity);
    if (!identity.resourceId || !row || row.runId !== identity.runId || row.workflowName !== identity.workflowName || row.resourceId !== identity.resourceId || !terminalWorkflow(workflowSnapshot(row).status)) throw new NativeCancellationUnconfirmed();
    return row;
  } catch (error) {
    if (error instanceof NativeCancellationUnconfirmed) throw error;
    throw new NativeCancellationUnconfirmed(error);
  }
}

/** Run.cancel may resolve after a failed save; confirm actual persistence before the caller releases capacity. */
export async function cancelNativeWorkflow(identity: NativeWorkflowIdentity, request: () => Promise<void>, read: NativeWorkflowOutcomeReader): Promise<WorkflowRun> {
  let requestError: unknown;
  try { await request(); } catch (error) { requestError = error; }
  try { return await confirmedWorkflowOutcome(identity, read); }
  catch (error) { throw new NativeCancellationUnconfirmed(requestError ?? error); }
}
