import { ModelRouterLanguageModel, type MastraModelConfig } from '@mastra/core/llm';
import { assistantModels, type AssistantModelId } from '../limits.js';

export type NativeTurnModel = Extract<MastraModelConfig, { specificationVersion: 'v2' | 'v3' | 'v4' }>;

/** The qualified assistant model at its registry endpoint, with its key mapped explicitly. */
export function createAssistantModel(config: { model: AssistantModelId; apiKey: string }): NativeTurnModel {
  return new ModelRouterLanguageModel({ id: config.model, apiKey: config.apiKey });
}

export type TitleProviderOptions = Readonly<Record<string, Readonly<Record<string, string>>>>;
const minimalEffort = Object.freeze({ reasoningEffort: 'minimal' });
/**
 * Provider options for the one title call, qualified per model so a newly qualified model must choose its own.
 * Muse Spark always reasons and cannot turn it off; `minimal` is its lowest effort. The model router reads
 * `openai` on Meta's registry endpoint and `meta` (the provider id) on an explicit OpenAI-compatible URL.
 */
const titleOptions: Readonly<Record<AssistantModelId, TitleProviderOptions>> = Object.freeze({
  'meta/muse-spark-1.3': Object.freeze({ openai: minimalEffort, meta: minimalEffort }),
  'meta/muse-wonder-1.0': Object.freeze({ openai: minimalEffort, meta: minimalEffort }),
});

/** The title options for a composed model, or none for a model not qualified here. */
export function titleProviderOptions(model: NativeTurnModel): TitleProviderOptions {
  const id = `${model.provider}/${model.modelId}`;
  const qualified = assistantModels.find(value => value === id);
  return qualified ? titleOptions[qualified] : {};
}
