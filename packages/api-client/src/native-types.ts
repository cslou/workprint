import type { SendAgentMessageParams } from '@mastra/client-js';

export type NativeTurnScope = Required<Pick<SendAgentMessageParams, 'threadId' | 'resourceId'>>;
export type NativeTextInput = NativeTurnScope & { message: string };
export type NativeSendReceipt = { runId: string; inputMessageId: string };
/** Observed native stop, NOT a saved-completion acknowledgment. Reload the exact ID separately. */
export type NativeObservedFinish = { runId: string; assistantMessageId: string };
export type NativeTextDelta = { runId: string; text: string };
/**
 * Native terminal evidence only; no branch promises retained terminal history. `failed` means the server
 * ended the turn with an error, deadline or rejection; a lost observation is a client failure, not an outcome.
 */
export type NativeObservedTurn =
  | { outcome: 'complete'; runId: string; assistantMessageId: string }
  | { outcome: 'interrupted'; runId: string; assistantMessageId?: string }
  | { outcome: 'failed'; runId: string; reason: 'error' | 'deadline' | 'rejected' };
