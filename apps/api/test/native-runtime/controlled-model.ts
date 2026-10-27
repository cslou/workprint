import { watch } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';

export async function publish(path: string, contents: string) {
  await writeFile(`${path}.pending`, contents, { flag: 'wx' });
  await rename(`${path}.pending`, path);
}

export async function waitFile(path: string, signal: AbortSignal = AbortSignal.timeout(10000)): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const watcher = watch(dirname(path), () => { void inspect(); });
    const close = () => { watcher.close(); signal.removeEventListener('abort', abort); };
    const abort = () => { close(); reject(new DOMException('Qualification wait aborted', 'AbortError')); };
    async function inspect() {
      try { const value = await readFile(path, 'utf8'); close(); resolve(value); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { close(); reject(error); }
      }
    }
    watcher.on('error', (error) => { close(); reject(error); });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else void inspect();
  });
}

type ModelStream = Awaited<ReturnType<MastraLanguageModelV2Mock['doStream']>>['stream'];
type ModelPart = ModelStream extends ReadableStream<infer Part> ? Part : never;

export function controlledModel(directory: string) {
  let count = 0;
  const model = new MastraLanguageModelV2Mock({
    modelId: 'qualification-only',
    doStream: async (options) => {
      const call = ++count;
      const inputs = options.prompt.flatMap((message) => typeof message.content === 'string' ? [message.content] : message.content.flatMap((part) => part.type === 'text' ? [part.text] : []));
      await publish(join(directory, `call-${call}.json`), JSON.stringify({ call, inputs }));
      const stream = new ReadableStream<ModelPart>({ start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: `text-${call}` });
        controller.enqueue({ type: 'text-delta', id: `text-${call}`, delta: `controlled-output-${call}` });
        const signal = AbortSignal.any([AbortSignal.timeout(30000), ...(options.abortSignal ? [options.abortSignal] : [])]);
        void waitFile(join(directory, `release-${call}`), signal).then(() => {
          controller.enqueue({ type: 'text-end', id: `text-${call}` });
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
          controller.close();
        }, (error: unknown) => controller.error(error));
      } });
      return { stream };
    },
  });
  return {
    specificationVersion: model.specificationVersion, provider: model.provider, modelId: model.modelId, supportedUrls: model.supportedUrls,
    doStream: model.doStream.bind(model),
    doGenerate: async () => { await writeFile(join(directory, 'unexpected-generate'), 'unexpected'); throw new Error('Unexpected non-stream model call'); },
  };
}
