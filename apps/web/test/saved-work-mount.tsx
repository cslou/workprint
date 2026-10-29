import { createRoot } from 'react-dom/client';
import { Shell } from '../src/shell/shell.js';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import { MaterialPanel } from '../src/materials/panel.js';
import { useWorkspace } from '../src/shell/workspace.js';
import { WorkspaceReadPlaceholder } from '../src/shell/workspace-placeholder.js';
import type { ReadScope } from '../src/api/use-scoped-read.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

function PersistedPanel({ connection, scope }: { connection: BrowserClient; scope: ReadScope }) {
  const read = useWorkspace(connection, scope);
  const workspace = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  return <MaterialPanel connection={connection} scope={scope} workspace={workspace} {...(workspace ? {} : { placeholder: <WorkspaceReadPlaceholder state={read.failure ?? 'loading'} /> })} />;
}

const node = document.getElementById('root');
if (!node) throw new Error('Missing saved-work verification root');
const root = createRoot(node);
(window as unknown as { savedWorkTest: unknown }).savedWorkTest = {
  configure(input: { apiOrigin: string; token: string | null; accountId: string; conversationId: string; panelOnly?: boolean }) {
    const connection = createBrowserClient(input.apiOrigin, async () => input.token);
    root.render(input.panelOnly ? <PersistedPanel connection={connection} scope={{ accountId: input.accountId, conversationId: input.conversationId }} /> : <Shell connection={connection} session={{ accountId: input.accountId, name: 'Synthetic creator' }} conversationId={input.conversationId} />);
  },
  unmount() { root.render(null); },
};
