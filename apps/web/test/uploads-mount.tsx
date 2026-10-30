import { createRoot } from 'react-dom/client';
import { nativeConversations, transferUpload } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { ReadScope } from '../src/api/use-scoped-read.js';
import { createBrowserClient } from '../src/api/client.js';
import type { BrowserClient } from '../src/api/client.js';
import { Composer } from '../src/conversation/composer.js';
import { confirmUpload } from '../src/uploads/uploads.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Isolated actual upload composer/consumer. No production shell or fabricated confirmation control.
const node = document.getElementById('root');
if (!node) throw new Error('Missing uploads test root');
const root = createRoot(node);
let connection: BrowserClient = { kind: 'missing' };
let scope: ReadScope | null = null;
let accessToken: string | null = null;
let confirmation = '';
let mountGeneration = 0;
let pending: AbortController | null = null;
let prepared: { file: File; grant: OperationResponse<'requestUpload'>; confirmOperation: string } | null = null;
const render = () => root.render(<div style={{ width: 'min(720px, 100%)' }}><Composer key={JSON.stringify([scope?.accountId ?? null, scope?.conversationId ?? null])} native={nativeConversations} connection={connection} scope={scope} /><p className={confirmation ? 'wp-chat-feedback' : undefined} data-confirm role="status">{confirmation}</p></div>);
(window as unknown as { uploadsTest: unknown }).uploadsTest = {
  configure({ apiOrigin, token = null, accountId, conversationId }: { apiOrigin?: string; token?: string | null; accountId: string; conversationId?: string }) {
    mountGeneration += 1; pending?.abort(); prepared = null;
    accessToken = token;
    if (apiOrigin !== undefined) connection = createBrowserClient(apiOrigin, async () => accessToken);
    scope = { accountId, ...(conversationId === undefined ? {} : { conversationId }) };
    confirmation = '';
    render();
  },
  async authorize(input: { name: string; type: string; bytes: number[] }) {
    const generation = mountGeneration;
    if (connection.kind !== 'configured' || !scope?.conversationId) return { ok: false, error: { code: 'not_implemented' } };
    const file = new File([new Uint8Array(input.bytes)], input.name, { type: input.type });
    pending?.abort(); const controller = new AbortController(); pending = controller;
    const result = await connection.client.requestUpload({ params: { id: scope.conversationId }, query: {}, body: { operationId: crypto.randomUUID(), kind: 'image', filename: file.name, contentType: file.type, byteSize: file.size, intendedUse: { purpose: 'reference' } } }, { signal: controller.signal });
    if (generation !== mountGeneration) return { ok: false, error: { code: 'cancelled' } };
    if (result.ok) prepared = { file, grant: result.value, confirmOperation: crypto.randomUUID() };
    return result;
  },
  async transfer() {
    const generation = mountGeneration, captured = prepared;
    if (!captured) return { ok: false, error: { code: 'invalid_input' } };
    pending?.abort(); const controller = new AbortController(); pending = controller;
    const result = await transferUpload(captured.grant, captured.file, { signal: controller.signal });
    return generation === mountGeneration ? result : { ok: false, error: { code: 'cancelled' } };
  },
  async confirmPrepared() {
    if (!prepared || connection.kind !== 'configured') return { ok: false, error: { code: 'invalid_input' } };
    return connection.client.confirmUpload({ params: { id: prepared.grant.uploadId }, query: {}, body: { operationId: prepared.confirmOperation } });
  },
  async confirm(uploadId: string) {
    const generation = mountGeneration;
    const outcome = await confirmUpload(connection, uploadId);
    if (generation === mountGeneration) {
      confirmation = outcome.kind === 'saved' ? `Confirmed ${outcome.value.version.id}` : outcome.feedback;
      render();
    }
    return outcome.kind;
  },
  unmount() { mountGeneration += 1; pending?.abort(); prepared = null; root.render(null); },
};
