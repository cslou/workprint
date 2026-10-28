import { createRoot } from 'react-dom/client';
import { workspaceSchema } from '@workprint/contracts';
import type { OperationResponse } from '@workprint/contracts';
import { createBrowserClient } from '../src/api/client.js';
import { PlanningEditor } from '../src/storyboard/planning-editor.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Labelled read-only public projection, not persisted work or an opaque-content schema.
const workspace = workspaceSchema.parse({ script: null, assets: [], storyboard: { work: { version: { id: 'board-v7', artifactId: 'board-artifact', revision: 7, kind: 'storyboard', content: { camera: 'Opaque camera must not render.' }, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: [] }, use: null, state: 'Draft' }, shots: [{ shotId: 'shot-b', order: 20, intent: 'Second Shot', chosenVideoVersionId: null, panels: [] }, { shotId: 'shot-a', order: 10, intent: 'First Shot', chosenVideoVersionId: null, panels: [{ panelId: 'panel-b', order: 8, description: 'Second Panel description.', references: ['reference-v2'], candidateImageVersions: [], approvedImageVersionId: null }, { panelId: 'panel-a', order: 3, description: 'First Panel description.', references: [], candidateImageVersions: [], approvedImageVersionId: null }] }] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 9 });
const node = document.getElementById('root');
if (!node) throw new Error('Missing Storyboard test root');
const root = createRoot(node);
type Input = { apiOrigin?: string; token?: string | null; accountId?: string; conversationId?: string; shot?: boolean; workspace?: OperationResponse<'workspace'> };
(window as unknown as { storyboardTest: unknown }).storyboardTest = {
  configure(input: Input) {
    const connection = input.apiOrigin === undefined ? { kind: 'missing' as const } : createBrowserClient(input.apiOrigin, async () => input.token ?? null);
    root.render(<div className="wp-panel-body" style={{ width: 380 }}><PlanningEditor connection={connection} scope={{ accountId: input.accountId ?? 'read-only-account', conversationId: input.conversationId ?? 'read-only-conversation' }} workspace={input.workspace ?? workspace} target={input.shot ? { kind: 'shot', shotId: 'shot-a' } : { kind: 'panel', shotId: 'shot-a', panelId: 'panel-b' }} onEdited={() => { throw new Error('This composition only qualifies real backend failures, not successful persistence'); }} /></div>);
  },
  unmount() { root.render(null); },
};
