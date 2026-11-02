import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A scripted create answer. Without one, the fake starts a task and answers its id. */
export type FakeCreateStep =
  | { readonly taskId?: string }
  | { readonly status: number; readonly code?: number }
  | { readonly raw: string };
/** A scripted query answer. Without one, each task moves `queued → running → succeeded` over its queries. */
export type FakeQueryStep =
  | { readonly task: 'queued' | 'running' | 'succeeded' | 'cancelled' }
  | { readonly task: 'failed'; readonly code?: string }
  | { readonly status: number; readonly code?: number }
  | { readonly raw: string };
/** A scripted download answer. Without one, the fake serves the clip. */
export type FakeDownloadStep =
  | { readonly status: number }
  | { readonly redirect: string }
  /** Serves this many bytes, declaring no length, so only the reader's limit stops it. */
  | { readonly oversize: number };
/** Any step may wait for `after` before it answers; `hang` never answers until the fake closes. */
type Timed<T> = T & { readonly after?: Promise<unknown> } | { readonly hang: true };
export type FakeVideoRequest = { readonly method: string; readonly path: string; readonly authorization: string | undefined; readonly body: Record<string, unknown> };

const codes: Record<number, [string, string]> = {
  400: ['invalid_request_error', 'invalid params (2013)'], 401: ['authentication_error', 'invalid api key (1004)'],
  402: ['insufficient_balance_error', 'insufficient balance (1008)'], 422: ['invalid_request_error', 'sensitive content (1026)'],
  429: ['rate_limit_error', 'rate limit exceeded (1002)'], 500: ['api_error', 'internal error (1000)'],
};
function error(response: ServerResponse, status: number, code?: number) {
  const [type, message] = codes[status] ?? ['api_error', 'scripted failure (1000)'];
  response.writeHead(status, { 'content-type': 'application/json' })
    .end(JSON.stringify({ type: 'error', error: { type, message: code ? message.replace(/\(\d+\)/, `(${code})`) : message, http_code: String(status) } }));
}

/**
 * Loopback MiniMax Video V2 for tests: `POST /v2/video_generation`, `GET /v2/query/video_generation/:id`
 * and a clip download at `/files/:id.mp4`, with the shapes observed live on 2026-11-02. It
 * records each request with its parsed body and counts creates, so tests can prove nothing was
 * submitted twice.
 */
export async function miniMaxVideoFake(options: { clip?: Buffer } = {}) {
  const creates: Timed<FakeCreateStep>[] = [], queries: Timed<FakeQueryStep>[] = [], downloads: Timed<FakeDownloadStep>[] = [];
  const requests: FakeVideoRequest[] = [];
  const tasks = new Map<string, { queries: number; ratio: string }>();
  let clip = options.clip ?? Buffer.from('fake clip bytes');
  let next = 424010985738600;
  const open = new Set<ServerResponse>();
  const server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (part: string) => { raw += part; });
    request.on('end', () => void answer(request.method ?? '', request.url ?? '', request.headers.authorization, raw, response));
  });
  async function answer(method: string, path: string, authorization: string | undefined, raw: string, response: ServerResponse) {
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* recorded as empty */ }
    requests.push({ method, path, authorization, body });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const create = method === 'POST' && path === '/v2/video_generation';
    const query = method === 'GET' ? /^\/v2\/query\/video_generation\/([\w-]+)$/.exec(path) : null;
    const file = method === 'GET' ? /^\/files\/([\w-]+)\.mp4(\?.*)?$/.exec(path) : null;
    const step = create ? creates.shift() : query ? queries.shift() : file ? downloads.shift() : undefined;
    if (step && 'hang' in step) { open.add(response); return; }
    if (step?.after) { open.add(response); await step.after; open.delete(response); }
    if (create) {
      const scripted = step as FakeCreateStep | undefined;
      if (scripted && 'status' in scripted) return error(response, scripted.status, scripted.code);
      if (scripted && 'raw' in scripted) return void response.writeHead(200, { 'content-type': 'application/json' }).end(scripted.raw);
      const taskId = scripted?.taskId ?? String(next++);
      tasks.set(taskId, { queries: 0, ratio: typeof body.ratio === 'string' ? body.ratio : '16:9' });
      return void response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ task_id: taskId }));
    }
    if (query) {
      const taskId = query[1]!, scripted = step as FakeQueryStep | undefined;
      if (scripted && 'status' in scripted) return error(response, scripted.status, scripted.code);
      if (scripted && 'raw' in scripted) return void response.writeHead(200, { 'content-type': 'application/json' }).end(scripted.raw);
      const seen = tasks.get(taskId);
      if (seen === undefined && !scripted) return error(response, 400);
      const queries = seen?.queries ?? 0;
      tasks.set(taskId, { queries: queries + 1, ratio: seen?.ratio ?? '16:9' });
      const status = scripted?.task ?? (['queued', 'running', 'succeeded'] as const)[Math.min(queries, 2)];
      // The shape observed live on 2026-11-02 (outputs/verification/sprint-009/).
      const task = {
        id: taskId, model: 'MiniMax-H3', status, created_at: 1793614118, updated_at: 1793614209, resolution: '768P', duration: 5,
        ratio: seen?.ratio ?? '16:9', task_type: 'generation',
        usage: status === 'succeeded' ? { total_seconds: 5, input_seconds: 0, output_seconds: 5, input_image_count: 0, total_tokens: 162745, prompt_tokens: 0, completion_tokens: 162745 } : {},
        ...(status === 'succeeded' ? { content: { url: `${base}/files/${taskId}.mp4?Expires=1793621409&Signature=fake-signature` } } : {}),
        ...(status === 'failed' ? { error: { code: scripted && 'code' in scripted && scripted.code ? scripted.code : '1027', message: 'generation failed' } } : {}),
      };
      return void response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ task }));
    }
    if (file) {
      const scripted = step as FakeDownloadStep | undefined;
      if (scripted && 'status' in scripted) return void response.writeHead(scripted.status).end();
      if (scripted && 'redirect' in scripted) return void response.writeHead(302, { location: scripted.redirect }).end();
      if (scripted && 'oversize' in scripted) {
        response.writeHead(200, { 'content-type': 'video/mp4' });
        const chunk = Buffer.alloc(64 * 1024);
        let left = scripted.oversize;
        const write = () => { while (left > 0) { const part = chunk.subarray(0, Math.min(left, chunk.length)); left -= part.length; if (!response.write(part)) { response.once('drain', write); return; } } response.end(); };
        response.on('error', () => { left = 0; });
        return write();
      }
      return void response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(clip.length) }).end(clip);
    }
    response.writeHead(404).end();
  }
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    /** Base URL for the client, like `https://api.minimax.io`. */
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    script: {
      create(...steps: Timed<FakeCreateStep>[]) { creates.push(...steps); },
      query(...steps: Timed<FakeQueryStep>[]) { queries.push(...steps); },
      download(...steps: Timed<FakeDownloadStep>[]) { downloads.push(...steps); },
    },
    /** How many create requests reached the fake. */
    get creates() { return requests.filter(request => request.method === 'POST').length; },
    requests,
    /** The clip each succeeded task serves. */
    serve(bytes: Buffer) { clip = bytes; },
    reset() { creates.length = 0; queries.length = 0; downloads.length = 0; requests.length = 0; tasks.clear(); },
    close: () => new Promise<void>(resolve => { for (const response of open) response.destroy(); server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
export type MiniMaxVideoFake = Awaited<ReturnType<typeof miniMaxVideoFake>>;
