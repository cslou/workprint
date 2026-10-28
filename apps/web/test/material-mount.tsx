import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { versionSchema, workspaceSchema } from '@workprint/contracts';
import type { OperationResponse } from '@workprint/contracts';
import { MaterialPanel } from '../src/materials/panel.js';
import type { MaterialPrerequisites } from '../src/materials/presentation.js';
import type { WorkspaceTab } from '../src/ui/panel.js';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Explicit read-only display/edit prerequisites. None of these field names define a domain schema.
const script = versionSchema.parse({ id: 'script-v7', artifactId: 'script-example', revision: 7, kind: 'script', content: { synopsis: 'Mercer and Vale sit side by side on the gallery bench.', whatHappens: 'Opaque content must not render.', look: 'Opaque look must not render.' }, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: ['reference-v2'] });
const reference = versionSchema.parse({ ...script, id: 'reference-v2', artifactId: 'reference-example', revision: 2, kind: 'reference', content: { name: 'Opaque reference name must not render.' }, dependencies: [] });
const shot = (shotId: string, order: number, intent: string) => ({ shotId, order, intent, panels: [], chosenVideoVersionId: null });
const workspace = workspaceSchema.parse({ script: { version: script, use: { id: 'script-use', versionId: script.id, state: 'approved', binding: { purpose: 'script' } }, state: 'Ready' }, assets: [{ version: reference, use: { id: 'reference-use', versionId: reference.id, state: 'approved', binding: { purpose: 'reference', role: 'vale-role' } }, state: 'Ready' }], storyboard: { work: null, shots: [shot('shot-2', 20, 'Vale recognises Mercer'), shot('shot-1', 10, 'Vale and Mercer on the bench')] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 9 });
const prerequisites: MaterialPrerequisites = { presentations: [
  { versionId: script.id, revision: 7, sections: [{ label: 'What happens', text: 'Mercer and Vale sit side by side on the gallery bench.', field: 'synopsis' }], shots: [{ shotId: 'shot-1', description: 'Both of them, seen together from the front.' }, { shotId: 'shot-2', description: 'Close on Vale as he recognises Mercer.', dialogue: 'Vale: “You must be Mercer.”' }], duration: 'About 13 seconds in all.', look: ['Natural colour', 'Soft daylight', 'Widescreen'] },
  { versionId: reference.id, revision: 2, name: 'Vale reference', description: 'Character sheet', thumbnail: { src: '/references/assets/media-placeholder.svg', alt: 'Vale thumbnail' }, sheet: { kicker: 'Character reference', name: 'Vale', summary: 'Dark navy overcoat · charcoal suit', sections: [{ title: 'Identity', layout: 'hero', text: 'Late forties, light stubble.', figures: [{ src: '/references/assets/media-placeholder.svg', alt: 'Vale front view', caption: 'Front · neutral expression' }] }, { title: 'Wardrobe', text: 'Navy overcoat over a charcoal suit.' }, { title: 'Missing views', text: 'Side and back views are not supplied.' }] } },
], history: [] };
const node = document.getElementById('root');
if (!node) throw new Error('Missing material test root');
const root = createRoot(node);
let connection: BrowserClient = { kind: 'missing' };
let token: string | null = null;
type Input = { apiOrigin?: string; token?: string | null; accountId?: string; conversationId?: string; prerequisites?: boolean; workspace?: OperationResponse<'workspace'> };
function Harness({ input }: { input: Input }) {
  const [tab, setTab] = useState<WorkspaceTab>('script');
  return <div style={{ width: 'min(380px,100%)' }}><MaterialPanel connection={connection} scope={{ accountId: input.accountId ?? 'read-only-account', conversationId: input.conversationId ?? 'read-only-conversation' }} workspace={input.workspace ?? workspace} {...(input.prerequisites ? { prerequisites } : {})} selectedKey={tab} onSelectionChange={(key) => setTab(key as WorkspaceTab)} /></div>;
}
(window as unknown as { materialTest: unknown }).materialTest = {
  configure(input: Input) {
    token = input.token ?? null;
    if (input.apiOrigin !== undefined) connection = createBrowserClient(input.apiOrigin, async () => token);
    root.render(<Harness key={JSON.stringify([input.accountId, input.conversationId])} input={input} />);
  },
  unmount() { root.render(null); },
};
