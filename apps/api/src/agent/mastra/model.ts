import { ModelRouterLanguageModel, type MastraModelConfig } from '@mastra/core/llm';
import type { AssistantModelId } from '../limits.js';

export type NativeTurnModel = Extract<MastraModelConfig, { specificationVersion: 'v2' | 'v3' | 'v4' }>;

/** The qualified assistant model at its registry endpoint, with its key mapped explicitly. */
export function createAssistantModel(config: { model: AssistantModelId; apiKey: string }): NativeTurnModel {
  return new ModelRouterLanguageModel({ id: config.model, apiKey: config.apiKey });
}
