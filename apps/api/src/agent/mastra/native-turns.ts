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
const bindings = new WeakMap<Mastra, { tools: readonly AgentTool[]; limits: TurnLimits; nameVideo: NameVideo; shutdown: AbortController }>();
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
  const shutdown = new AbortController();
  mastra.addAgent(new Agent({
    id: nativeAssistantId, name: 'Assistant', instructions: systemPrompt,
    model: withStallLimit(turns.model, limits.stallMs, shutdown.signal),
    memory: createNativeTextMemory(storage), maxRetries: 0,
    // Zero automatic provider retries: drop Mastra's default retry and request-repair error processors.
    errorProcessorDefaults: false,
    tools: nativeTools(turns.tools, turns.collaborators, shutdown.signal),
    inputProcessors: [completedSteps(limits.maxSteps)],
    defaultOptions: {
      maxSteps: limits.maxSteps,
      modelSettings: { maxOutputTokens: limits.maxOutputTokens, maxRetries: 0, timeout: { totalMs: limits.turnMs } },
    },
    durable: { cleanupTimeoutMs: limits.cleanupMs },
  }));
  bindings.set(mastra, { tools: turns.tools, limits, nameVideo: createVideoTitler(turns.model, storage, limits), shutdown });
}

export function hasNativeTurns(mastra: Mastra) { return bindings.has(mastra); }

/** True when turns are bound and the server is not shutting down, so a new turn may start. */
export function acceptsNativeTurns(mastra: Mastra) { const binding = bindings.get(mastra); return !!binding && !binding.shutdown.signal.aborted; }

/** The tools bound to this instance; none when turns are not bound. */
export function nativeToolRegistry(mastra: Mastra): readonly AgentTool[] { return bindings.get(mastra)?.tools ?? []; }

/**
 * Server shutdown: running tools see their signal fire with reason `shutdown`, then every active turn is
 * aborted as Stop aborts one. No new turn is admitted after (`acceptsNativeTurns`), and any model call still made is refused
 * unsent, so no model step follows. Runs once; a no-op when turns are not bound.
 */
export function stopNativeTurns(mastra: Mastra) {
  const binding = bindings.get(mastra);
  if (!binding || binding.shutdown.signal.aborted) return;
  binding.shutdown.abort(new Error('Server shutting down'));
  const agent = mastra.getAgent(nativeAssistantId);
  for (const run of agent.listActiveThreadRuns()) agent.abortRunStream(run.runId);
}

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
