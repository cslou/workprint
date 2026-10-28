import { createRoot } from 'react-dom/client';
import { nativeConversations } from '@workprint/api-client';
import { Composer } from '../src/conversation/composer.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Deliberately no shell/question styles: Composer owns its appearance.
const node = document.getElementById('root');
if (!node) throw new Error('Missing standalone composer root');
const docked = new URLSearchParams(location.search).has('docked');
createRoot(node).render(<div style={{ width: 720 }}><Composer native={nativeConversations} docked={docked} /></div>);
