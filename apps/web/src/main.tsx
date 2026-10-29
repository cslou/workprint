import { createRoot } from 'react-dom/client';
import { Shell } from './shell/shell.js';
import { createConfiguredBrowserClient } from './api/runtime.js';
import './ui/tokens.css';
import './ui/foundations.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
const connection = createConfiguredBrowserClient(async () => null);
createRoot(root).render(<Shell connection={connection} session={null} />);
