import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { TokenLimiterProcessor, type Processor } from '@mastra/core/processors';
import { createNativeTextMemory } from './native-text-memory.js';

export const nativeAssistantId = 'assistant';
export const nativeTurnLimits = Object.freeze({ inputBytes: 8192, estimatedOutputTokens: 64, firstContentMs: 3000, modelCallMs: 7000, executionMs: 8000, cleanupMs: 100 });
export type NativeTurnModel = Extract<MastraModelConfig, { specificationVersion: 'v2' | 'v3' | 'v4' }>;
const bindings = new WeakSet<Mastra>();
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Native normalizes incomplete provider EOF to stop; require the actual LLM terminal chunk first. */
const completedText = {
  id: 'native-completed-text',
  processLLMResponse({ chunks, abort }) {
    const finish = chunks.find(chunk => chunk.type === 'step-finish');
    if (!finish || !object(finish.payload) || !object(finish.payload.stepResult) || finish.payload.stepResult.reason !== 'stop') abort('Native response did not complete');
  },
} satisfies Processor;

/** Only trusted composition supplies a model object. No environment/key/provider discovery. */
export function bindNativeTurns(mastra: Mastra, model: NativeTurnModel) {
  if (bindings.has(mastra)) throw new Error('Native assistant already bound');
  const storage = mastra.getStorage();
  if (!storage) throw new Error('Native assistant storage unavailable');
  const memory = createNativeTextMemory(storage);
  mastra.addAgent(new Agent({
    id: nativeAssistantId, name: 'Assistant', instructions: 'Return only a text response. Do not use tools.', model, memory, maxRetries: 0,
    inputProcessors: [completedText], outputProcessors: [new TokenLimiterProcessor({ limit: nativeTurnLimits.estimatedOutputTokens, strategy: 'abort' })],
    defaultOptions: {
      maxSteps: 1,
      modelSettings: { maxOutputTokens: nativeTurnLimits.estimatedOutputTokens, timeout: { totalMs: nativeTurnLimits.executionMs, stepMs: nativeTurnLimits.modelCallMs, firstChunkMs: nativeTurnLimits.firstContentMs } },
    },
    durable: { cleanupTimeoutMs: nativeTurnLimits.cleanupMs },
  }));
  bindings.add(mastra);
}

export function hasNativeTurns(mastra: Mastra) { return bindings.has(mastra); }
