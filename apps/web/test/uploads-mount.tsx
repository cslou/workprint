import { createRoot } from 'react-dom/client';
import { nativeConversations } from '@workprint/api-client';
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
const render = () => root.render(<div style={{ width: 720 }}><Composer key={JSON.stringify([scope?.accountId ?? null, scope?.conversationId ?? null])} native={nativeConversations} connection={connection} scope={scope} /><p data-confirm role="status">{confirmation}</p></div>);
(window as unknown as { uploadsTest: unknown }).uploadsTest = {
  configure({ apiOrigin, token = null, accountId, conversationId }: { apiOrigin?: string; token?: string | null; accountId: string; conversationId?: string }) {
    accessToken = token;
    if (apiOrigin !== undefined) connection = createBrowserClient(apiOrigin, async () => accessToken);
    scope = { accountId, ...(conversationId === undefined ? {} : { conversationId }) };
    confirmation = '';
    render();
  },
  async confirm(uploadId: string) {
    const outcome = await confirmUpload(connection, uploadId);
    confirmation = outcome.kind === 'saved' ? `Confirmed ${outcome.value.version.id}` : outcome.feedback;
    render();
    return outcome.kind;
  },
  unmount() { root.render(null); },
};
