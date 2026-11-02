import type { AgentTool } from './tools/index.js';
import { graphemes } from './graphemes.js';

/** Shown for a registered tool that defines no activity phrase. */
export const genericToolPhrase = 'Working…';
/** running: the tool is executing. done: it returned. failed: it threw. incomplete: it never finished (for example, Stop). */
export type ToolActivityState = 'running' | 'done' | 'failed' | 'incomplete';
/** The only tool facts that leave the server: never arguments, results or errors. */
export type ToolActivity = { toolCallId: string; tool: string; phrase: string; state: ToolActivityState; summary?: string };

const callId = /^[A-Za-z0-9_.:-]{1,128}$/;
const summaryCharacters = 60;

/**
 * Projects one native tool call to its safe activity line, looking up the phrase and done summary in
 * the registry. An unregistered tool name (anything the model invented) or a malformed call id yields null.
 */
export function projectToolActivity(registry: readonly AgentTool[], call: { toolCallId: unknown; toolName: unknown; state: ToolActivityState; input?: unknown; output?: unknown }): ToolActivity | null {
  const tool = registry.find(candidate => candidate.id === call.toolName);
  if (!tool || typeof call.toolCallId !== 'string' || !callId.test(call.toolCallId)) return null;
  let phrase: string | undefined;
  try { phrase = tool.phraseFor?.(call.input); } catch { phrase = undefined; }
  const activity: ToolActivity = { toolCallId: call.toolCallId, tool: tool.id, phrase: phrase ?? tool.phrase ?? genericToolPhrase, state: call.state };
  if (call.state !== 'done' || !tool.doneSummary) return activity;
  let summary: string | undefined;
  try { summary = tool.doneSummary(call.output); } catch { summary = undefined; }
  const flat = typeof summary === 'string' ? summary.replace(/\s+/g, ' ').trim() : '';
  const characters = graphemes(flat);
  return flat ? { ...activity, summary: characters.length <= summaryCharacters ? flat : `${characters.slice(0, summaryCharacters - 1).join('')}…` } : activity;
}
