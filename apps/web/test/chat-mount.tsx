import { createRoot } from 'react-dom/client';
import { nativeConversations } from '@workprint/api-client';
import type { ApiClient } from '@workprint/api-client';
import { Composer } from '../src/conversation/composer.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';
import '../src/shell/shell.css';

const node = document.getElementById('root');
if (!node) throw new Error('Missing chat test root');
const root = createRoot(node);
const calls: string[] = [];
const native = Object.fromEntries(Object.entries(nativeConversations).map(([name, method]) => [name, async () => { calls.push(name); return method(); }])) as ApiClient['native'];
(window as unknown as { chatTest: unknown }).chatTest = {
  configure(working: boolean) { root.render(<main><Composer native={native} working={working} /></main>); },
  unmount() { root.render(null); },
  calls() { return calls; },
};
