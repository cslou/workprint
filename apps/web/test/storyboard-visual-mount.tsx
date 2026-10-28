import { createRoot } from 'react-dom/client';
import { loadReference } from './reference-loader.js';
import { WorkspacePanel } from '../src/ui/panel.js';
import { GenerationRequests } from '../src/videos/requests.js';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import { workspace, video, videoWorkspace } from './storyboard-fixtures.js';
import { Storyboard } from '../src/storyboard/storyboard.js';
import { Videos } from '../src/videos/videos.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

await loadReference('flow2-step1-r73.html');
const node = document.querySelector('.panel');
if (!node) throw new Error('Missing tracked visual root');
const style = document.createElement('style');
style.textContent = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}b,strong{font-weight:600}';
document.head.append(style);
const root = createRoot(node);
(window as unknown as { storyboardVisual: unknown }).storyboardVisual = {
  configure(input: { origin?: string; token?: string; view?: 'requests' | 'storyboard' | 'panel' | 'board' | 'videos' }) {
    const connection: BrowserClient = input.origin ? createBrowserClient(input.origin, async () => input.token ?? null) : { kind: 'missing' };
    const scope = { accountId: 'read-only-account', conversationId: 'read-only-conversation' };
    const board = <Storyboard connection={connection} scope={scope} workspace={workspace} />;
    const content = input.view === 'videos' ? <Videos connection={connection} scope={scope} workspace={videoWorkspace()} prerequisites={{ versions: [video] }} /> : <GenerationRequests connection={connection} scope={scope} workspace={workspace} />;
    root.render(<WorkspacePanel selectedKey={input.view === 'storyboard' || input.view === 'panel' || input.view === 'board' ? 'storyboard' : 'videos'} content={{ storyboard: board, videos: content }} />);
  },
};
