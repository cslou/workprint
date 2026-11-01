export const maximumBodyBytes = 1024 * 1024;
const bodyReadMilliseconds = 2000;

type Intake = { bytes: Uint8Array<ArrayBuffer> | undefined; body: unknown };

/** The single JSON size/time policy, for intake and the readable native handoff. */
export async function readIntake(request: Request): Promise<Intake> {
  const length = request.headers.get('content-length');
  if (length && /^\d+$/.test(length) && BigInt(length) > BigInt(maximumBodyBytes)) throw new Error('Body limit');
  if (!request.body) return { bytes: undefined, body: {} };
  if (request.method === 'GET' || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new Error('Invalid body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Body deadline')), bodyReadMilliseconds); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maximumBodyBytes) throw new Error('Body limit');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes, body: JSON.parse(new TextDecoder().decode(bytes)) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

export async function readBody(request: Request): Promise<unknown> {
  return (await readIntake(request)).body;
}
