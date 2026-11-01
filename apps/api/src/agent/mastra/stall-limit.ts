import type { NativeTurnModel } from './model.js';

export class ModelStallError extends Error {
  constructor(stallMs: number) {
    super(`Model call sent no data for ${stallMs} ms`);
    this.name = 'ModelStallError';
  }
}

type StreamCall = (options: { abortSignal?: AbortSignal }) => Promise<{ stream: ReadableStream<unknown> }>;

/**
 * Fails a model call when no data arrives for `stallMs`, including while waiting for the
 * response. Each received chunk resets the limit, so long replies are never cut off.
 * Other model members pass through unchanged, bound to the original model.
 */
export function withStallLimit(model: NativeTurnModel, stallMs: number): NativeTurnModel {
  const target = model as unknown as Record<PropertyKey, unknown> & { doStream: StreamCall };
  const doStream: StreamCall = async (options) => {
    const local = new AbortController();
    const abortSignal = options.abortSignal ? AbortSignal.any([options.abortSignal, local.signal]) : local.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limited = <T>(work: Promise<T>) => new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => { local.abort(); reject(new ModelStallError(stallMs)); }, stallMs);
      work.then(resolve, reject).finally(() => clearTimeout(timer));
    });
    const result = await limited(target.doStream.call(model, { ...options, abortSignal }));
    const reader = result.stream.getReader();
    const stream = new ReadableStream<unknown>({
      async pull(controller) {
        try {
          const next = await limited(reader.read());
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        } catch (error) {
          reader.cancel(error).catch(() => undefined);
          controller.error(error);
        }
      },
      cancel(reason) {
        clearTimeout(timer);
        return reader.cancel(reason);
      },
    });
    return { ...result, stream };
  };
  return new Proxy(target, {
    get(object, property) {
      if (property === 'doStream') return doStream;
      const value: unknown = Reflect.get(object, property, object);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(object) : value;
    },
  }) as unknown as NativeTurnModel;
}
