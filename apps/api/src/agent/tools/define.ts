import type { z } from 'zod';
import type { AssistantSheets, ReadImageInputs, ReadOwnedWorkspace, SaveAssistantScript, SaveAssistantStoryboard, SaveGeneratedImage, VideoJobs } from '../../application/index.js';
import type { MetaImageClient } from '../../generation/index.js';

/** Trusted scope from the admitted native run, never from model arguments. */
export interface ToolScope {
  readonly accountId: string;
  readonly videoId: string;
}

/** Application functions that tools may call, the Meta image client and the video jobs. Supplied once by composition. */
export type AgentCollaborators = Readonly<{
  readWorkspace: ReadOwnedWorkspace; saveScript: SaveAssistantScript; saveStoryboard: SaveAssistantStoryboard;
  readImageInputs: ReadImageInputs; saveGeneratedImage: SaveGeneratedImage;
  /** Saves a script subject's sheet and reads the video's use room. */
  sheets: AssistantSheets;
  /** Absent when images can't be saved (no storage or media checker) or a test composes no Meta fake; the tool then refuses before any call. */
  images?: Pick<MetaImageClient, 'generate' | 'edit'>;
  /** Absent without storage, the media checker or a MiniMax key (or a test's MiniMax fake); the tool then refuses before any call. */
  videos?: Pick<VideoJobs, 'start' | 'resume' | 'stopped'>;
}>;

/** Why a tool's signal fired: the exact-turn Stop, the turn deadline or a server shutdown. */
export type ToolAbortReason = 'stop' | 'deadline' | 'shutdown';

export interface ToolContext {
  readonly scope: ToolScope;
  readonly collaborators: AgentCollaborators;
  readonly signal: AbortSignal;
  /** Why `signal` fired, fixed by whichever came first; undefined while it has not fired. */
  readonly abortReason: () => ToolAbortReason | undefined;
}

/** A saved image or video version to show under a done line. */
export type ShownMedia = Readonly<{ kind: 'image' | 'video'; versionId: string }>;

/** Framework-neutral tool definition. `agent/mastra` turns these into native tools. */
export interface AgentTool {
  readonly id: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  /** Activity phrase shown while the tool runs; a tool without one shows a generic phrase. */
  readonly phrase?: string;
  /** A phrase from the call's arguments, when they are valid; otherwise `phrase` is shown. */
  readonly phraseFor?: (input: unknown) => string | undefined;
  /** Short summary for the done line, derived from the tool's own result. */
  readonly doneSummary?: (output: unknown) => string | undefined;
  /** Saved images and videos to show under the done line, derived from the tool's own result. */
  readonly shownMedia?: (output: unknown) => readonly ShownMedia[] | undefined;
  readonly execute: (input: unknown, context: ToolContext) => Promise<unknown>;
}

/** Keeps a tool's input typed by its schema while the registry stores the erased shape. */
export function defineTool<Schema extends z.ZodType, Output>(tool: {
  id: string;
  description: string;
  inputSchema: Schema;
  phrase?: string;
  phraseFor?: (input: z.infer<Schema>) => string;
  doneSummary?: (output: Output) => string | undefined;
  shownMedia?: (output: Output) => readonly ShownMedia[] | undefined;
  execute: (input: z.infer<Schema>, context: ToolContext) => Promise<Output>;
}): AgentTool {
  const { doneSummary, execute, phraseFor, shownMedia, ...rest } = tool;
  return {
    ...rest,
    ...(phraseFor ? { phraseFor: (input: unknown) => { const parsed = tool.inputSchema.safeParse(input); return parsed.success ? phraseFor(parsed.data) : undefined; } } : {}),
    ...(doneSummary ? { doneSummary: (output: unknown) => doneSummary(output as Output) } : {}),
    ...(shownMedia ? { shownMedia: (output: unknown) => shownMedia(output as Output) } : {}),
    execute: (input, context) => execute(tool.inputSchema.parse(input), context),
  };
}

