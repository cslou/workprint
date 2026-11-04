import { pathToFileURL } from 'node:url';
import type { AssistantModelId, TurnLimits } from '../../src/agent/index.js';
import type { VideoJobTiming } from '../../src/application/index.js';
import type { StartOptions } from '../../src/mastra/server.js';
import { placeholderMetaKey, placeholderMiniMaxKey } from './environment.js';

/** Server start options for the built entry, plus the test-only `/test/slow` route. */
export type ChatServer = Pick<StartOptions, 'routeTimeoutMs' | 'node'> & { readonly slowRoute?: boolean };
/** The loopback MiniMax fake, with polling and the create timeout shortened for tests. */
export type ChatVideos = { readonly url: string; readonly timing?: VideoJobTiming; readonly submitTimeoutMs?: number };

/**
 * Composition source for `buildServerComposition`: the real backend with Muse Spark routed to the
 * scripted provider, production tools plus test tools, and optional limit and server overrides.
 */
export function chatComposition(provider: { url: string; gateUrl: string }, limits: Partial<TurnLimits> = {}, images?: { url: string }, server: ChatServer = {}, videos?: ChatVideos) {
  return composition({ url: provider.url, apiKey: placeholderMetaKey }, provider.gateUrl, limits, images, server, videos);
}

/** Live composition for `pnpm live:chat --live`: the real Meta endpoints and the given model, key read from the child env. */
export function liveChatComposition(gateUrl: string, model: AssistantModelId = 'meta/muse-spark-1.3') {
  return composition(undefined, gateUrl, {}, undefined, {}, undefined, model);
}

/**
 * Scripted runs reach Meta images and MiniMax only through loopback fakes (`images.url`, `videos.url`); live runs use
 * the real Meta API and compose no video client.
 */
function composition(scripted: { url: string; apiKey: string } | undefined, gateUrl: string, limits: Partial<TurnLimits>, images?: { url: string }, server: ChatServer = {}, videos?: ChatVideos, live: AssistantModelId = 'meta/muse-spark-1.3') {
  const { slowRoute, ...start } = server;
  const imageClient = scripted
    ? images ? `createMetaImageClient({ apiKey: ${JSON.stringify(scripted.apiKey)}, baseUrl: ${JSON.stringify(images.url)}, retryDelayMs: 1 })` : 'undefined'
    : 'createMetaImageClient({ apiKey: process.env.META_API_KEY, baseUrl: metaImageBaseUrl })';
  const videoClient = scripted && videos
    ? `createMiniMaxVideoClient({ apiKey: ${JSON.stringify(placeholderMiniMaxKey)}, baseUrl: ${JSON.stringify(videos.url)}, retryDelayMs: 1, download: createSafeDownload({ allowLoopback: true }), ${videos.submitTimeoutMs ? `submitTimeoutMs: ${videos.submitTimeoutMs}` : ''} })`
    : 'undefined';
  const tools = pathToFileURL(new URL('./chat-tools.js', import.meta.url).pathname).href;
  return (src: string) => `
    import { ModelRouterLanguageModel } from '@mastra/core/llm';
    import { createBackend } from ${JSON.stringify(pathToFileURL(`${src}/mastra/backend.js`).href)};
    import { createAssistantModel, productionTools, turnLimits } from ${JSON.stringify(pathToFileURL(`${src}/agent/index.js`).href)};
    import { createMetaImageClient, createMiniMaxVideoClient, createSafeDownload, metaImageBaseUrl } from ${JSON.stringify(pathToFileURL(`${src}/generation/index.js`).href)};
    import { chatTestRoutes, chatTestTools } from ${JSON.stringify(tools)};
    // Live uses the production factory; scripted routes the same model id to the loopback provider.
    const model = ${scripted ? `new ModelRouterLanguageModel({ id: 'meta/muse-spark-1.3', apiKey: ${JSON.stringify(scripted.apiKey)}, url: ${JSON.stringify(scripted.url)} })` : `createAssistantModel({ model: ${JSON.stringify(live)}, apiKey: process.env.META_API_KEY })`};
    const images = ${imageClient};
    const videos = ${videoClient};
    const serverOptions = ${JSON.stringify(start)};
    const mastra = await createBackend(${slowRoute ? 'chatTestRoutes()' : '[]'}, {
      model,
      ...(images ? { images } : {}),
      ...(videos ? { videos${videos?.timing ? `, videoTiming: ${JSON.stringify(videos.timing)}` : ''} } : {}),
      tools: [...productionTools, ...chatTestTools(${JSON.stringify(gateUrl)})],
      limits: { ...turnLimits, ...${JSON.stringify(limits)} },
    });
  `;
}
