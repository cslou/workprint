import { createRoot } from 'react-dom/client';
import { Shell, type SessionPresentation } from '../src/shell/shell.js';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

const node = document.getElementById('root');
if (!node) throw new Error('Missing shell test root');
const root = createRoot(node);
let connection: BrowserClient = { kind: 'missing' };
let calls = 0;
let accessToken: string | null = null;
(window as unknown as { shellTest: unknown }).shellTest = {
  configure({ session, conversationId, apiOrigin, token = null }: { session: SessionPresentation | null; conversationId?: string; apiOrigin?: string; token?: string | null }) {
    accessToken = token;
    if (apiOrigin !== undefined) connection = createBrowserClient(apiOrigin, async () => { calls++; return accessToken; });
    root.render(<Shell connection={connection} session={session} {...(conversationId === undefined ? {} : { conversationId })} workspaceContent={(workspace) => ({ script: <p>Workspace revision {workspace.selectionRevision}</p> })} />);
  },
  tokenCalls() { return calls; },
};
