import { pathToFileURL } from 'node:url';
import type { TurnLimits } from '../../src/agent/index.js';
import { placeholderMetaKey } from './environment.js';

/**
 * Composition source for `buildServerComposition`: the real backend with Muse Spark routed to the
 * scripted provider, production tools plus test tools, and optional limit overrides.
 */
export function chatComposition(provider: { url: string; gateUrl: string }, limits: Partial<TurnLimits> = {}) {
  return composition({ url: provider.url, apiKey: placeholderMetaKey }, provider.gateUrl, limits);
}

/** Live composition for `pnpm live:chat --live`: the real Meta endpoint, key read from the child env. */
export function liveChatComposition(gateUrl: string) {
  return composition(undefined, gateUrl, {});
}

function composition(scripted: { url: string; apiKey: string } | undefined, gateUrl: string, limits: Partial<TurnLimits>) {
  const tools = pathToFileURL(new URL('./chat-tools.js', import.meta.url).pathname).href;
  return (src: string) => `
    import { ModelRouterLanguageModel } from '@mastra/core/llm';
    import { createBackend } from ${JSON.stringify(pathToFileURL(`${src}/mastra/backend.js`).href)};
    import { createAssistantModel, productionTools, turnLimits } from ${JSON.stringify(pathToFileURL(`${src}/agent/index.js`).href)};
    import { chatTestTools } from ${JSON.stringify(tools)};
    // Live uses the production factory; scripted routes the same model id to the loopback provider.
    const model = ${scripted ? `new ModelRouterLanguageModel({ id: 'meta/muse-spark-1.3', apiKey: ${JSON.stringify(scripted.apiKey)}, url: ${JSON.stringify(scripted.url)} })` : `createAssistantModel({ model: 'meta/muse-spark-1.3', apiKey: process.env.META_API_KEY })`};
    const mastra = await createBackend([], {
      model,
      tools: [...productionTools, ...chatTestTools(${JSON.stringify(gateUrl)})],
      limits: { ...turnLimits, ...${JSON.stringify(limits)} },
    });
  `;
}
