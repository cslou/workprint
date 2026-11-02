/**
 * Server-only client for Meta's image API (`muse-image-1.0`): text-to-image generation and image
 * edits. It follows Meta's documented request fields, always asks for base64 results, and maps
 * failures to a closed set of codes. Errors never carry the key, the prompt or image bytes.
 */

export const metaImageModel = 'muse-image-1.0';
export const metaImageBaseUrl = 'https://api.meta.ai/v1';
const maxImages = 10;
const maxRatio = 16;

export type ImageOutputFormat = 'webp' | 'png' | 'jpeg';
export type ImageContentType = 'image/webp' | 'image/png' | 'image/jpeg';

/** Meta's documented generation fields; omitted fields take Meta's defaults. */
export interface ImageRequest {
  readonly prompt: string;
  /** 1–10 images; Meta's default is 1. */
  readonly n?: number;
  /** `"auto"` or `"WxH"`. It sets the shape, not exact pixels. */
  readonly size?: string;
  readonly outputFormat?: ImageOutputFormat;
  readonly reasoningStrength?: 'high' | 'low';
  /** Meta's built-in tools; each is on unless set to false. */
  readonly tools?: { readonly imageSearch?: boolean; readonly webSearch?: boolean; readonly shell?: boolean };
}
/** One input image: a base64 data URL, or a public `https` URL. */
export type ImageInput = { readonly dataUrl: string } | { readonly url: string };
export interface EditRequest extends ImageRequest { readonly images: readonly ImageInput[] }

export interface ImageResult {
  readonly images: readonly { readonly bytes: Uint8Array; readonly contentType: ImageContentType }[];
  /** Meta's `x-request-id`, for support; null when absent. */
  readonly requestId: string | null;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens: number } | null;
}

export type MetaImageErrorCode = 'content_policy' | 'invalid_request' | 'unavailable' | 'failed' | 'aborted';
const messages: Record<MetaImageErrorCode, string> = {
  content_policy: 'Meta refused the image request under its content policy',
  invalid_request: 'Meta did not accept the image request',
  unavailable: 'Meta image generation is unavailable',
  failed: 'Meta image generation failed',
  aborted: 'The image request was stopped',
};
export class MetaImageError extends Error {
  override readonly name = 'MetaImageError';
  /** The request field Meta named, when it named one. */
  readonly param: string | undefined;
  constructor(readonly code: MetaImageErrorCode, param?: string) {
    super(param ? `${messages[code]} (${param})` : messages[code]);
    this.param = param;
  }
}

export interface MetaImageClient {
  generate(request: ImageRequest, signal?: AbortSignal): Promise<ImageResult>;
  edit(request: EditRequest, signal?: AbortSignal): Promise<ImageResult>;
}
export interface MetaImageClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  /** Per attempt; 120 s by default (observed calls take about 10 s). */
  readonly timeoutMs?: number;
  /** Wait before the one retry of a 503 or 429. */
  readonly retryDelayMs?: number;
  readonly fetch?: typeof fetch;
}

const formats: Record<ImageOutputFormat, ImageContentType> = { webp: 'image/webp', png: 'image/png', jpeg: 'image/jpeg' };
const signatures: Record<ImageContentType, (bytes: Buffer) => boolean> = {
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': bytes => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/webp': bytes => bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
};
const invalid = (param: string): never => { throw new MetaImageError('invalid_request', param); };

/** Validates and maps a request to Meta's field names. Invalid requests are refused before sending. */
function body(request: ImageRequest, images?: readonly ImageInput[]): Record<string, unknown> {
  if (typeof request.prompt !== 'string' || !request.prompt.trim()) invalid('prompt');
  if (request.n !== undefined && (!Number.isInteger(request.n) || request.n < 1 || request.n > maxImages)) invalid('n');
  if (request.size !== undefined && request.size !== 'auto') {
    const match = /^(\d{1,5})x(\d{1,5})$/.exec(request.size);
    const [width, height] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
    if (!width || !height || Math.max(width, height) / Math.min(width, height) > maxRatio) invalid('size');
  }
  if (request.outputFormat !== undefined && !(request.outputFormat in formats)) invalid('output_format');
  if (request.reasoningStrength !== undefined && request.reasoningStrength !== 'high' && request.reasoningStrength !== 'low') invalid('reasoning_strength');
  const tools = request.tools ?? {};
  const toolEnablement = Object.fromEntries(([['imageSearch', 'enable_image_search'], ['webSearch', 'enable_web_search'], ['shell', 'enable_shell']] as const)
    .filter(([name]) => tools[name] !== undefined).map(([name, field]) => [field, tools[name] === true]));
  if (images !== undefined) {
    if (images.length < 1 || images.length > maxImages) invalid('images');
    images.forEach((image, index) => {
      if ('dataUrl' in image ? !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl) : !/^https:\/\/\S+$/.test(image.url)) invalid(`images[${index}]`);
    });
  }
  return {
    model: metaImageModel, prompt: request.prompt, response_format: 'b64_json',
    ...(request.n !== undefined ? { n: request.n } : {}),
    ...(request.size !== undefined ? { size: request.size } : {}),
    ...(request.outputFormat !== undefined ? { output_format: request.outputFormat } : {}),
    ...(request.reasoningStrength !== undefined ? { reasoning_strength: request.reasoningStrength } : {}),
    ...(Object.keys(toolEnablement).length ? { tool_enablement: toolEnablement } : {}),
    ...(images !== undefined ? { images: images.map(image => ({ image_url: 'dataUrl' in image ? image.dataUrl : image.url })) } : {}),
  };
}

const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const safeParam = (value: unknown) => typeof value === 'string' && /^[\w.[\]]{1,100}$/.test(value) ? value : undefined;

/** Maps an error response. Meta's message is never copied: it can echo the request. */
function failure(status: number, text: string): MetaImageError {
  let error: Record<string, unknown> | undefined;
  try { error = record(record(JSON.parse(text))?.error); } catch { error = undefined; }
  if (status === 400 && error?.code === 'content_policy_violation') return new MetaImageError('content_policy');
  if (status === 400 || status === 415) return new MetaImageError('invalid_request', safeParam(error?.param));
  if (status === 503 || status === 429) return new MetaImageError('unavailable');
  return new MetaImageError('failed');
}

function result(text: string, requested: ImageOutputFormat | undefined, requestId: string | null): ImageResult {
  let parsed: Record<string, unknown> | undefined;
  try { parsed = record(JSON.parse(text)); } catch { parsed = undefined; }
  const data = parsed?.data;
  const format = parsed?.output_format ?? requested ?? 'webp';
  if (!Array.isArray(data) || !data.length || typeof format !== 'string' || !(format in formats)) throw new MetaImageError('failed');
  const contentType = formats[format as ImageOutputFormat];
  const images = data.map(item => {
    const encoded = record(item)?.b64_json;
    if (typeof encoded !== 'string' || !encoded) throw new MetaImageError('failed');
    const bytes = Buffer.from(encoded, 'base64');
    if (!signatures[contentType](bytes)) throw new MetaImageError('failed');
    return { bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), contentType };
  });
  const usage = record(parsed?.usage);
  const count = (name: string) => typeof usage?.[name] === 'number' ? usage[name] : null;
  const [inputTokens, outputTokens, totalTokens] = [count('input_tokens'), count('output_tokens'), count('total_tokens')];
  return { images, requestId, usage: inputTokens !== null && outputTokens !== null && totalTokens !== null ? { inputTokens, outputTokens, totalTokens } : null };
}

export function createMetaImageClient(options: MetaImageClientOptions): MetaImageClient {
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000, retryDelayMs = options.retryDelayMs ?? 1000;
  const base = options.baseUrl.replace(/\/+$/, '');

  async function attempt(path: string, payload: string, signal: AbortSignal | undefined): Promise<{ status: number; text: string; requestId: string | null }> {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await send(`${base}${path}`, {
        method: 'POST', body: payload,
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const requestId = response.headers.get('x-request-id');
      return { status: response.status, text: await response.text(), requestId: requestId && /^[\w-]{1,128}$/.test(requestId) ? requestId : null };
    } catch {
      if (signal?.aborted) throw new MetaImageError('aborted');
      throw new MetaImageError(timeout.aborted ? 'unavailable' : 'failed');
    }
  }

  async function call(path: string, request: ImageRequest, images: readonly ImageInput[] | undefined, signal: AbortSignal | undefined): Promise<ImageResult> {
    const payload = JSON.stringify(body(request, images));
    if (signal?.aborted) throw new MetaImageError('aborted');
    let response = await attempt(path, payload, signal);
    if (response.status === 503 || response.status === 429) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, retryDelayMs);
        signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      if (signal?.aborted) throw new MetaImageError('aborted');
      response = await attempt(path, payload, signal);
    }
    if (response.status !== 200) throw failure(response.status, response.text);
    return result(response.text, request.outputFormat, response.requestId);
  }

  return {
    generate: (request, signal) => call('/images/generations', request, undefined, signal),
    edit: (request, signal) => call('/images/edits', request, request.images, signal),
  };
}
