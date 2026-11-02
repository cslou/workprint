import type { AgentTool } from './define.js';
import { generateImageTool } from './generate-image/index.js';
import { generateSheetTool } from './generate-sheet/index.js';
import { generateVideoTool } from './generate-video/index.js';
import { readWorkspaceTool } from './read-workspace/index.js';
import { updateScriptTool } from './update-script/index.js';

export { defineTool, type AgentCollaborators, type AgentTool, type ShownMedia, type ToolAbortReason, type ToolContext, type ToolScope } from './define.js';

/** Tools registered in production. Each lives in its own folder under `agent/tools/`. */
export const productionTools: readonly AgentTool[] = Object.freeze([readWorkspaceTool, updateScriptTool, generateImageTool, generateSheetTool, generateVideoTool]);
