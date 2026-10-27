import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import './ui/foundations.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <main>
    <h1>Workprint</h1>
    <p>Application foundation. Filmmaking and assistant features are not available yet.</p>
  </main>,
);
