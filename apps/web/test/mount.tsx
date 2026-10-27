import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { createRoot } from 'react-dom/client';
import { Button, TextField } from '../src/ui/controls.js';
import { WorkspacePanel } from '../src/ui/panel.js';
import { ViewerDialog, DetailsPopover } from '../src/ui/overlays.js';
import { Feedback, StatusPill } from '../src/ui/status.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

function Viewer({ trigger = <Button>View look A</Button> }: { trigger?: ReactElement }) {
  return <ViewerDialog trigger={trigger} title="Vale · look A" footer={<><div className="wp-viewer-nav"><Button variant="round" aria-label="Previous look"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Button><Button variant="round" aria-label="Next look"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></Button></div><Button isDisabled size="choose">Choose look A</Button></>}><img className="wp-viewer-image" src="/references/assets/media-placeholder.svg" alt="Look A: longer swept-back hair, open collar" /></ViewerDialog>;
}
function Interactions() {
  const [count, setCount] = useState(0);
  return <main><Button onPress={() => setCount(count + 1)}>Activate</Button><Button isDisabled onPress={() => setCount(count + 100)}>Disabled action</Button><Button variant="quiet">Quiet action</Button><Feedback>Activations: {count}</Feedback><TextField label="Search library" placeholder="Search" /><WorkspacePanel /><Viewer /><DetailsPopover trigger={<Button>Open details</Button>} title="Details"><p>Read-only details</p></DetailsPopover><StatusPill state="draft" /></main>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing test root');
const context = new URLSearchParams(location.search).get('context');
if (!context) createRoot(root).render(<Interactions />);
else {
  const paths: Record<string, string> = { opening: 'flow2-step1-r73.html', assets: 'flow1-step4-r85.html', viewer: 'flow1-step4-r85.html', search: 'library-picker-r92.html', 'assets-ready': 'flow2-step9-r81.html', versions: 'flow2-step9-r81.html' };
  const path = paths[context];
  if (!path) throw new Error('Unknown reference context');
  const response = await fetch(`/references/${path}`);
  if (!response.ok) throw new Error('Reference unavailable');
  const documentReference = new DOMParser().parseFromString(await response.text(), 'text/html');
  documentReference.querySelectorAll('[src]').forEach((element) => { element.setAttribute('src', `/references/${element.getAttribute('src')}`); });
  document.body.innerHTML = documentReference.body.innerHTML;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = '/references/app-r11.css'; document.head.prepend(stylesheet);
  // Reference-only surroundings are not product shell/page implementation.
  if (context === 'opening') {
    const panel = document.querySelector('.panel');
    if (!panel) throw new Error('Missing reference panel');
    createRoot(panel).render(<WorkspacePanel />);
    const send = document.querySelector('.send');
    if (!send) throw new Error('Missing reference send');
    const host = document.createElement('span'); send.replaceWith(host);
    createRoot(host).render(<Button isDisabled>Send</Button>);
  }
  if (['assets', 'assets-ready', 'versions'].includes(context)) document.querySelectorAll('.status').forEach((element) => { const state = element.textContent === 'Chosen' ? 'chosen' : element.classList.contains('ready') ? 'ready' : element.classList.contains('draft') ? 'draft' : 'empty'; createRoot(element).render(<StatusPill state={state} />); element.className = ''; (element as HTMLElement).style.display = 'contents'; });
  if (context === 'viewer') {
    document.querySelectorAll('.lightbox').forEach((element) => element.remove());
    const tile = document.querySelector('.tile[href="#look-a"]');
    if (!tile) throw new Error('Missing viewer opener');
    const markup = tile.innerHTML;
    const host = document.createElement('span'); host.style.display = 'contents'; tile.replaceWith(host);
    createRoot(host).render(<Viewer trigger={<AriaButton className="tile" style={{ padding: 0, textAlign: 'inherit' }} aria-label="View look A"><span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: markup }} /></AriaButton>} />);
  }
  if (context === 'search') {
    const search = document.querySelector('.lp-search');
    if (!search) throw new Error('Missing reference search');
    const host = document.createElement('span'); host.style.display = 'contents'; search.replaceWith(host);
    createRoot(host).render(<TextField label="Search library" placeholder="Search" variant="search" hideLabel />);
  }
  // Explicitly expose readiness after React/layout and stylesheet have settled.
  await document.fonts.ready;
  if (context === 'opening') await new Promise<void>((resolve) => { const poll = () => document.querySelector('[role="tab"]') ? resolve() : requestAnimationFrame(poll); poll(); });
  if (['assets', 'assets-ready', 'versions'].includes(context)) await new Promise<void>((resolve) => { const poll = () => document.querySelector('.wp-status') ? resolve() : requestAnimationFrame(poll); poll(); });
  if (context === 'search') await new Promise<void>((resolve) => { const poll = () => document.querySelector('input') ? resolve() : requestAnimationFrame(poll); poll(); });
  if (context === 'assets-ready') location.hash = 'p-assets';
  if (context === 'versions') location.hash = 'p-takes';
  document.body.dataset.ready = 'true';
}
