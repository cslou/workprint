import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { Processor } from '@mastra/core/processors';
import { stepLimitReason, type TurnLimits } from '../limits.js';
import type { AgentCollaborators, AgentTool } from '../tools/index.js';
import type { NativeTurnModel } from './model.js';
import { createNativeTextMemory } from './native-text-memory.js';
import { withStallLimit } from './stall-limit.js';
import { createVideoTitler, type NameVideo } from './video-title.js';
import { nativeTools } from './tools.js';

export const nativeAssistantId = 'assistant';

/** Everything a turn needs, supplied once by composition. */
export interface NativeTurns {
  readonly model: NativeTurnModel;
  readonly tools: readonly AgentTool[];
  readonly limits: TurnLimits;
  readonly collaborators: AgentCollaborators;
}

/** Static, so the provider's automatic prefix caching holds: no workspace state, no timestamps. */
export const systemPrompt = [
  'You are the Workprint assistant. You help one filmmaker plan and make a short video in this conversation.',
  'Answer clearly and briefly. Use a tool when it helps answer from the video\'s real saved work.',
  'Never claim a tool\'s result before it has finished, and never invent saved work you have not read.',
].join('\n');

// What each Mastra instance was bound with: its tools, so stream and history redaction use the same phrases,
// and its video titler.
const bindings = new WeakMap<Mastra, { tools: readonly AgentTool[]; limits: TurnLimits; nameVideo: NameVideo }>();
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Native normalizes an incomplete provider EOF to stop, so require the LLM's own terminal chunk.
 * A tool-call end continues the loop, except on the final allowed step, which fails the turn.
 */
function completedSteps(maxSteps: number) {
  return {
    id: 'native-completed-steps',
    processLLMResponse({ chunks, stepNumber, abort }) {
      const finish = chunks.find(chunk => chunk.type === 'step-finish');
      const reason = finish && object(finish.payload) && object(finish.payload.stepResult) ? finish.payload.stepResult.reason : undefined;
      if (reason === 'tool-calls') {
        if (stepNumber + 1 >= maxSteps) abort(stepLimitReason);
        return;
      }
      if (reason !== 'stop') abort('Native response did not complete');
    },
  } satisfies Processor;
}

/** Only trusted composition supplies the model, tools and limits. No environment/key/provider discovery. */
export function bindNativeTurns(mastra: Mastra, turns: NativeTurns) {
  if (bindings.has(mastra)) throw new Error('Native assistant already bound');
  const storage = mastra.getStorage();
  if (!storage) throw new Error('Native assistant storage unavailable');
  const { limits } = turns;
  mastra.addAgent(new Agent({
    id: nativeAssistantId, name: 'Assistant', instructions: systemPrompt,
    model: withStallLimit(turns.model, limits.stallMs),
    memory: createNativeTextMemory(storage), maxRetries: 0,
    // Zero automatic provider retries: drop Mastra's default retry and request-repair error processors.
    errorProcessorDefaults: false,
    tools: nativeTools(turns.tools, turns.collaborators),
    inputProcessors: [completedSteps(limits.maxSteps)],
    defaultOptions: {
      maxSteps: limits.maxSteps,
      modelSettings: { maxOutputTokens: limits.maxOutputTokens, maxRetries: 0, timeout: { totalMs: limits.turnMs } },
    },
    durable: { cleanupTimeoutMs: limits.cleanupMs },
  }));
  bindings.set(mastra, { tools: turns.tools, limits, nameVideo: createVideoTitler(turns.model, storage, limits) });
}

export function hasNativeTurns(mastra: Mastra) { return bindings.has(mastra); }

/** The tools bound to this instance; none when turns are not bound. */
export function nativeToolRegistry(mastra: Mastra): readonly AgentTool[] { return bindings.get(mastra)?.tools ?? []; }

/** The limits this instance's turns were bound with; none when turns are not bound. */
export function nativeTurnLimits(mastra: Mastra): TurnLimits | undefined { return bindings.get(mastra)?.limits; }

/** After an accepted send: name the video from its message if it has no title yet. Never rejects. */
export function nameVideo(mastra: Mastra, accountId: string, videoId: string, message: string): Promise<void> {
  return bindings.get(mastra)?.nameVideo(accountId, videoId, message) ?? Promise.resolve();
}

/** The thread's active run in this process, if any. One active turn per video. */
export function activeNativeRun(mastra: Mastra, accountId: string, videoId: string): string | undefined {
  return mastra.getAgent(nativeAssistantId).getActiveThreadRunId({ resourceId: accountId, threadId: videoId });
}
