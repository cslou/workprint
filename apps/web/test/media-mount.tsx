import { createRoot } from 'react-dom/client';
import { versionSchema } from '@workprint/contracts';
import type { ClientResult } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { createBrowserClient } from '../src/api/client.js';
import { Videos } from '../src/videos/videos.js';
import { video, videoWorkspace } from './storyboard-fixtures.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Labelled read-only public projections. Successful media sources are supplied
// only by the isolated harness; the production consumer still performs the read.
const first = versionSchema.parse({ ...video, id: 'video-v1', revision: 1, kind: 'video', media: { contentType: 'video/mp4', byteSize: 456, width: 1280, height: 720, durationMs: 2000 } });
const second = video;
const projection = (() => {
  const value = videoWorkspace();
  const succeeded = value.videos.find((request) => request.id === 'request-succeeded');
  if (!succeeded) throw new Error('Missing read-only request projection');
  return { ...value, videos: [...value.videos, { ...succeeded, id: 'request-succeeded-v1', resultVersionId: first.id }] };
})();
type Media = OperationResponse<'media'>;
type Pending = { id: string; resolve(result: ClientResult<Media>): void };
const pending: Pending[] = [];
const requested: string[] = [];
const commands: string[] = [];
let accountId = 'read-only-account';
let conversationId = 'read-only-conversation';
const nativeLoad = HTMLMediaElement.prototype.load;
let loadCount = 0;
HTMLMediaElement.prototype.load = function load(this: HTMLMediaElement) { loadCount += 1; return nativeLoad.call(this); };
let connection = createBrowserClient('http://127.0.0.1:4179', async () => null);
const node = document.getElementById('root');
if (!node) throw new Error('Missing media test root');
const root = createRoot(node);
const render = () => {
  if (connection.kind !== 'configured') throw new Error('Media composition needs a loopback client');
  const client = connection.client;
  root.render(<div className="wp-panel-body" style={{ width: 380 }}><Videos connection={{ kind: 'configured', client }} scope={{ accountId, conversationId }} workspace={projection} prerequisites={{ versions: [second, first] }} /></div>);
};
(window as unknown as { mediaTest: unknown }).mediaTest = {
  configure(input: { apiOrigin?: string; token?: string | null; controlled?: boolean; accountId?: string }) {
    accountId = input.accountId ?? 'read-only-account';
    const base = createBrowserClient(input.apiOrigin ?? 'http://127.0.0.1:4179', async () => input.token ?? null);
    if (base.kind !== 'configured') throw new Error('Media composition needs a loopback client');
    connection = input.controlled ? { kind: 'configured', client: { ...base.client,
      version: async (value) => ({ ok: true, value: value.params.id === first.id ? first : second }),
      generationRequests: async () => ({ ok: true, value: { items: [], nextCursor: null } }),
      media: (value) => { requested.push(value.params.id); return new Promise((resolve) => pending.push({ id: value.params.id, resolve })); },
      useVersion: async () => { commands.push('useVersion'); return { ok: false, error: { code: 'not_implemented', message: 'Read-only composition' } }; },
      cancelGeneration: async () => { commands.push('cancelGeneration'); return { ok: false, error: { code: 'not_implemented', message: 'Read-only composition' } }; },
      createExport: async () => { commands.push('createExport'); return { ok: false, error: { code: 'not_implemented', message: 'Read-only composition' } }; },
    } } : base;
    render();
  },
  source(id: string, input: Partial<Media> = {}) {
    return { url: '/fixtures/clip.webm', expiresAt: new Date(Date.now() + 60_000).toISOString(), poster: '/fixtures/clip-poster.png', measured: { width: 320, height: 180, durationMs: 2000 }, ...input } as Media;
  },
  release(index: number, result: ClientResult<Media>) { const item = pending[index]; if (!item) throw new Error(`Missing pending media ${index}`); item.resolve(result); },
  pending() { return pending.map((item) => item.id); },
  requested() { return [...requested]; },
  commands() { return [...commands]; },
  switchScope(account: string, conversation = 'read-only-conversation') { accountId = account; conversationId = conversation; render(); },
  loadCalls() { return loadCount; },
  unmount() { root.render(null); },
};
