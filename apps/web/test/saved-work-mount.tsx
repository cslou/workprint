import { createRoot } from 'react-dom/client';
import { Shell } from '../src/shell/shell.js';
import { createBrowserClient } from '../src/api/client.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

const node = document.getElementById('root');
if (!node) throw new Error('Missing saved-work verification root');
const root = createRoot(node);
(window as unknown as { savedWorkTest: unknown }).savedWorkTest = {
  configure(input: { apiOrigin: string; token: string | null; accountId: string; conversationId: string }) {
    const connection = createBrowserClient(input.apiOrigin, async () => input.token);
    root.render(<Shell connection={connection} session={{ accountId: input.accountId, name: 'Synthetic creator' }} conversationId={input.conversationId} />);
  },
  unmount() { root.render(null); },
};
