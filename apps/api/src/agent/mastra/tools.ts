import { createTool } from '@mastra/core/tools';
import type { AgentCollaborators, AgentTool, ToolScope } from '../tools/index.js';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Scope comes from the admitted native run; the request account, when present, must agree. */
function trustedScope(context: { agent?: { threadId?: string; resourceId?: string }; requestContext?: { get(key: string): unknown } }): ToolScope {
  const accountId = context.agent?.resourceId, videoId = context.agent?.threadId;
  const requested = context.requestContext?.get('accountId');
  if (!uuid(accountId) || !uuid(videoId) || (requested !== undefined && requested !== accountId)) throw new Error('Tool scope unavailable');
  return { accountId, videoId };
}

/** Builds the native tool set once, so the tool list sent to the model stays identical across turns. */
export function nativeTools(registry: readonly AgentTool[], collaborators: AgentCollaborators) {
  const ids = new Set<string>();
  const tools: Record<string, ReturnType<typeof createTool>> = {};
  for (const tool of registry) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(tool.id) || ids.has(tool.id)) throw new Error('Invalid or duplicate tool id');
    ids.add(tool.id);
    tools[tool.id] = createTool({
      id: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (input, context) => tool.execute(input, {
        scope: trustedScope(context),
        collaborators,
        signal: context.abortSignal ?? new AbortController().signal,
      }),
    });
  }
  return Object.freeze(tools);
}
