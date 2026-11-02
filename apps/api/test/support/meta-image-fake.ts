import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32, deflateSync } from 'node:zlib';

/** Meta's AI-generated label, as observed in live `muse-image-1.0` PNGs (2026-11-02). */
export const metaXmp = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:iptcExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" iptcExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

/** One PNG chunk with its length and CRC. */
export const pngChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
};
/** An uncompressed international-text chunk, shaped like Meta's XMP block. */
export const itxt = (keyword: string, text: string, compressed = 0) => pngChunk('iTXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0, compressed, 0, 0, 0]), Buffer.from(text, 'utf8')]));

/**
 * A small valid 8-bit RGB PNG shaped like Meta's: IHDR, Meta's XMP `iTXt` (unless `xmp` is false),
 * IDAT and IEND. `before` and `after` insert extra chunks around IDAT, for refusal cases.
 */
export function testPng({ width = 64, height = 48, xmp = true, before = [], after = [], seed = 0 }: { width?: number; height?: number; xmp?: boolean; before?: Buffer[]; after?: Buffer[]; seed?: number } = {}): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * 3 + 1) + 1 + x * 3;
    rows[at] = (x * 4 + seed) & 255; rows[at + 1] = (y * 5 + seed * 3) & 255; rows[at + 2] = (seed * 7) & 255;
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header),
    ...(xmp ? [itxt('XML:com.adobe.xmp', metaXmp)] : []), ...before, pngChunk('IDAT', deflateSync(rows)), ...after, pngChunk('IEND', Buffer.alloc(0))]);
}

/** One scripted response. Without one, the fake answers 200 with `n` test PNGs. */
export type FakeImageStep =
  | { readonly images: readonly Buffer[]; readonly outputFormat?: string }
  | { readonly status: number; readonly error?: Record<string, unknown> }
  | { readonly raw: string }
  /** Never answers, until the request is aborted or the fake closes. */
  | { readonly hang: true };
export type FakeImageRequest = { readonly path: string; readonly authorization: string | undefined; readonly body: Record<string, unknown> };

/**
 * Loopback Meta image API for tests: `POST /v1/images/generations` and `/v1/images/edits` with the
 * response shape observed live on 2026-11-02. It records each request with its parsed body.
 */
export async function metaImageFake() {
  const steps: FakeImageStep[] = [];
  const requests: FakeImageRequest[] = [];
  let seed = 0;
  const server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (part: string) => { raw += part; });
    request.on('end', () => {
      const path = request.url ?? '';
      if (request.method !== 'POST' || !['/v1/images/generations', '/v1/images/edits'].includes(path)) { response.writeHead(404).end(); return; }
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(raw) as Record<string, unknown>; } catch { /* recorded as empty */ }
      requests.push({ path, authorization: request.headers.authorization, body });
      const step = steps.shift() ?? { images: Array.from({ length: typeof body.n === 'number' ? body.n : 1 }, () => testPng({ seed: ++seed })) };
      if ('hang' in step) return;
      if ('raw' in step) { response.writeHead(200, { 'content-type': 'application/json' }).end(step.raw); return; }
      if ('status' in step) { response.writeHead(step.status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: step.error ?? { type: 'server_error', message: 'scripted failure' } })); return; }
      response.writeHead(200, { 'content-type': 'application/json', 'x-request-id': `fake-${requests.length}` }).end(JSON.stringify({
        created: 1793588678, data: step.images.map(image => ({ b64_json: image.toString('base64') })),
        // Like Meta, the label follows the request and defaults to webp, so a missing format fails the signature check.
        output_format: step.outputFormat ?? (typeof body.output_format === 'string' ? body.output_format : 'webp'), background: 'opaque',
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    /** Base URL for the client, like `https://api.meta.ai/v1`. */
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    script(...next: FakeImageStep[]) { steps.push(...next); },
    requests,
    reset() { steps.length = 0; requests.length = 0; seed = 0; },
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
export type MetaImageFake = Awaited<ReturnType<typeof metaImageFake>>;
