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
const reads: { call: number; conversationId: string; settled: boolean; code: string | null }[] = [];
(window as unknown as { shellTest: unknown }).shellTest = {
  configure({ session, conversationId, apiOrigin, timeoutMs, token = null }: { session: SessionPresentation | null; conversationId?: string; apiOrigin?: string; timeoutMs?: number; token?: string | null }) {
    accessToken = token;
    if (apiOrigin !== undefined) {
      connection = createBrowserClient(apiOrigin, async () => { calls++; return accessToken; }, timeoutMs);
      if (connection.kind === 'configured') {
        const client = connection.client;
        connection = { kind: 'configured', client: { ...client, workspace: async (input, options) => {
          const observation = { call: reads.length + 1, conversationId: input.params.id, settled: false, code: null as string | null };
          reads.push(observation);
          try {
            const result = await client.workspace(input, options);
            observation.code = result.ok ? 'ok' : result.error.code;
            return result;
          } finally { observation.settled = true; }
        } } };
      }
    }
    root.render(<Shell connection={connection} session={session} {...(conversationId === undefined ? {} : { conversationId })} workspaceContent={(workspace) => ({ script: <p>Workspace revision {workspace.selectionRevision}</p> })} />);
  },
  tokenCalls() { return calls; },
  reads() { return reads; },
};
