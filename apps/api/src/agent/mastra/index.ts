import { Agent, type MastraLanguageModel } from '@mastra/core/agent';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';

export function createAssistant(storage: MastraCompositeStore, model?: MastraLanguageModel) {
  const memory = new Memory({
    storage,
    options: { lastMessages: 30, semanticRecall: false, workingMemory: { enabled: false }, observationalMemory: false, generateTitle: false },
  });
  return new Agent({
    id: 'assistant', name: 'Assistant', instructions: 'Workprint assistant. Product capabilities are not enabled.',
    model: model ?? (() => { throw new Error('Assistant functionality is unavailable'); }),
    memory,
    defaultOptions: () => ({ maxSteps: 3, modelSettings: { maxOutputTokens: 512, maxRetries: 0 }, abortSignal: AbortSignal.timeout(30000) }),
  });
}
