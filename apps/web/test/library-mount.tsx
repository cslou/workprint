import { createRoot } from 'react-dom/client';
import { createBrowserClient } from '../src/api/client.js';
import { createConfiguredBrowserClient } from '../src/api/runtime.js';
import { Library } from '../src/library/library.js';
import type { BrowserClient } from '../src/api/client.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

let node = document.getElementById('root');
if (new URLSearchParams(location.search).has('reference')) {
  const response = await fetch('/references/demo-05.html');
  if (!response.ok) throw new Error('Library reference unavailable');
  const reference = new DOMParser().parseFromString(await response.text(), 'text/html');
  reference.querySelectorAll('[src]').forEach((element) => element.setAttribute('src', `/references/${element.getAttribute('src')}`));
  document.body.innerHTML = reference.body.innerHTML;
  document.body.className = reference.body.className;
  document.documentElement.style.setProperty('--font-sans', 'var(--font-family-sans)');
  document.documentElement.style.setProperty('--font-display', 'var(--font-family-display)');
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = '/references/app-r11.css'; document.head.prepend(stylesheet);
  const empty = document.querySelector('.lp-empty');
  if (!empty) throw new Error('Missing Library reference');
  node = document.createElement('div'); node.style.display = 'contents'; empty.replaceWith(node);
  location.hash = 'lib-yours';
}
if (!node) throw new Error('Missing Library test root');
const root = createRoot(node);
let accessToken: string | null = null;
let connection: BrowserClient = createConfiguredBrowserClient(async () => accessToken);
(window as unknown as { libraryTest: unknown }).libraryTest = {
  configure({ apiOrigin, token, accountId, conversationId, timeoutMs }: { apiOrigin?: string; token: string | null; accountId: string; conversationId?: string; timeoutMs?: number }) {
    accessToken = token;
    if (apiOrigin !== undefined) {
      const configured = createBrowserClient(apiOrigin, async () => accessToken, timeoutMs);
      connection = configured;
    }
    root.render(<Library connection={connection} scope={{ accountId, ...(conversationId === undefined ? {} : { conversationId }) }}>{() => { throw new Error('Unexpected populated Library fixture'); }}</Library>);
  },
  unmount() { root.render(null); },
};
