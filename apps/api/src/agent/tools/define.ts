import type { z } from 'zod';
import type { ReadOwnedWorkspace } from '../../application/index.js';

/** Trusted scope from the admitted native run, never from model arguments. */
export interface ToolScope {
  readonly accountId: string;
  readonly videoId: string;
}

/** Application functions that tools may call. Supplied once by composition. */
export type AgentCollaborators = Readonly<{ readWorkspace: ReadOwnedWorkspace }>;

export interface ToolContext {
  readonly scope: ToolScope;
  readonly collaborators: AgentCollaborators;
  readonly signal: AbortSignal;
}

/** Framework-neutral tool definition. `agent/mastra` turns these into native tools. */
export interface AgentTool {
  readonly id: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  /** Activity phrase shown while the tool runs; a tool without one shows a generic phrase. */
  readonly phrase?: string;
  /** Short summary for the done line, derived from the tool's own result. */
  readonly doneSummary?: (output: unknown) => string | undefined;
  readonly execute: (input: unknown, context: ToolContext) => Promise<unknown>;
}

/** Keeps a tool's input typed by its schema while the registry stores the erased shape. */
export function defineTool<Schema extends z.ZodType, Output>(tool: {
  id: string;
  description: string;
  inputSchema: Schema;
  phrase?: string;
  doneSummary?: (output: Output) => string | undefined;
  execute: (input: z.infer<Schema>, context: ToolContext) => Promise<Output>;
}): AgentTool {
  const { doneSummary, execute, ...rest } = tool;
  return {
    ...rest,
    ...(doneSummary ? { doneSummary: (output: unknown) => doneSummary(output as Output) } : {}),
    execute: (input, context) => execute(tool.inputSchema.parse(input), context),
  };
}

