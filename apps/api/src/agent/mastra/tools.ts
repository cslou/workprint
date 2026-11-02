import { createTool } from '@mastra/core/tools';
import type { AgentCollaborators, AgentTool, ToolAbortReason, ToolScope } from '../tools/index.js';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Scope comes from the admitted native run; the request account, when present, must agree. */
function trustedScope(context: { agent?: { threadId?: string; resourceId?: string }; requestContext?: { get(key: string): unknown } }): ToolScope {
  const accountId = context.agent?.resourceId, videoId = context.agent?.threadId;
  const requested = context.requestContext?.get('accountId');
  if (!uuid(accountId) || !uuid(videoId) || (requested !== undefined && requested !== accountId)) throw new Error('Tool scope unavailable');
  return { accountId, videoId };
}

/**
 * Why a tool's signal fired, from what Mastra 1.79 reports: the turn deadline (`timeout.totalMs`) aborts the
 * run with a `MastraTimeoutError` whose `timeoutType` is `total`, and Stop (`threads/abort`) aborts it with no
 * reason, a plain AbortError. A shutdown aborts the binding's own signal with its own reason. The combined
 * signal keeps the reason of whichever fired first, so a later abort never changes the answer.
 */
function abortReason(signal: AbortSignal, shutdown: AbortSignal): ToolAbortReason | undefined {
  if (!signal.aborted) return undefined;
  if (shutdown.aborted && signal.reason === shutdown.reason) return 'shutdown';
  const reason: unknown = signal.reason;
  const deadline = reason instanceof Error && reason.name === 'MastraTimeoutError' && (reason as { timeoutType?: unknown }).timeoutType === 'total';
  return deadline ? 'deadline' : 'stop';
}

/**
 * Builds the native tool set once, so the tool list sent to the model stays identical across turns.
 * Each call's signal fires on its run's abort or on `shutdown`.
 */
export function nativeTools(registry: readonly AgentTool[], collaborators: AgentCollaborators, shutdown: AbortSignal) {
  const ids = new Set<string>();
  const tools: Record<string, ReturnType<typeof createTool>> = {};
  for (const tool of registry) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(tool.id) || ids.has(tool.id)) throw new Error('Invalid or duplicate tool id');
    ids.add(tool.id);
    tools[tool.id] = createTool({
      id: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (input, context) => {
        const signal = context.abortSignal ? AbortSignal.any([context.abortSignal, shutdown]) : shutdown;
        return tool.execute(input, { scope: trustedScope(context), collaborators, signal, abortReason: () => abortReason(signal, shutdown) });
      },
    });
  }
  return Object.freeze(tools);
}
