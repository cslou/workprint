import type { AgentTool } from './define.js';
import { readWorkspaceTool } from './read-workspace/index.js';

export { defineTool, type AgentCollaborators, type AgentTool, type ToolContext, type ToolScope } from './define.js';

/** Tools registered in production. Each lives in its own folder under `agent/tools/`. */
export const productionTools: readonly AgentTool[] = Object.freeze([readWorkspaceTool]);
