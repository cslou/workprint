/** Network mechanics shared by the provider clients: bounded body reads and an abortable wait. */

/**
 * The body's bytes, read only up to `limit`. A declared or actual length over the limit stops the read
 * (leaving the loop releases and cancels the stream) and throws `overflow()`.
 */
export async function readBounded(body: AsyncIterable<Uint8Array> | null, declared: number, limit: number, overflow: () => Error, discard: () => unknown): Promise<Buffer> {
  if (Number.isFinite(declared) && declared > limit) { await discard(); throw overflow(); }
  const chunks: Uint8Array[] = []; let size = 0, over = false;
  if (body) for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > limit) { over = true; break; }
    chunks.push(chunk);
  }
  if (over) throw overflow();
  return Buffer.concat(chunks, size);
}

/** Waits `ms`, or less when `signal` aborts first; never rejects. */
export function abortableDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>(resolve => {
    if (signal?.aborted) { resolve(); return; }
    const stop = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}
