import { createRoot } from 'react-dom/client';
import { workspaceSchema, versionSchema, generationRequestSchema } from '@workprint/contracts';
import type { OperationResponse } from '@workprint/contracts';
import { createBrowserClient } from '../src/api/client.js';
import { PlanningEditor } from '../src/storyboard/planning-editor.js';
import { Shell } from '../src/shell/shell.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Labelled read-only public projection, not persisted work or an opaque-content schema.
const workspace = workspaceSchema.parse({ script: null, assets: [], storyboard: { work: { version: { id: 'board-v7', artifactId: 'board-artifact', revision: 7, kind: 'storyboard', content: { camera: 'Opaque camera must not render.' }, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: [] }, use: null, state: 'Draft' }, shots: [{ shotId: 'shot-b', order: 20, intent: 'Second Shot', chosenVideoVersionId: null, panels: [] }, { shotId: 'shot-a', order: 10, intent: 'First Shot', chosenVideoVersionId: null, panels: [{ panelId: 'panel-b', order: 8, description: 'Second Panel description.', references: ['reference-v2'], candidateImageVersions: [], approvedImageVersionId: null }, { panelId: 'panel-a', order: 3, description: 'First Panel description.', references: [], candidateImageVersions: [], approvedImageVersionId: null }] }] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 9 });
const image = versionSchema.parse({ id: 'panel-image-v2', artifactId: 'panel-image-artifact', revision: 2, kind: 'image', media: { contentType: 'image/png', byteSize: 123, width: 128, height: 72 }, createdBy: 'assistant', createdAt: '2026-10-28T00:00:00Z', dependencies: [] });
workspace.storyboard.shots[1]!.panels[0]!.candidateImageVersions = [image, versionSchema.parse({ ...image, id: 'panel-image-v1', revision: 1 })];
workspace.storyboard.shots[1]!.panels[0]!.approvedImageVersionId = 'panel-image-v1';
const node = document.getElementById('root');
if (!node) throw new Error('Missing Storyboard test root');
const root = createRoot(node);
let nativeStopCalls = 0;
type Input = { apiOrigin?: string; token?: string | null; accountId?: string; conversationId?: string; shot?: boolean; composition?: boolean; videos?: boolean; workspace?: OperationResponse<'workspace'> };
(window as unknown as { storyboardTest: unknown }).storyboardTest = {
  configure(input: Input) {
    const connection = input.apiOrigin === undefined ? { kind: 'missing' as const } : createBrowserClient(input.apiOrigin, async () => input.token ?? null);
    if (input.composition) {
      // Explicit read-only workspace delivery seam; mutations still use the real client.
      const base = connection.kind === 'configured' ? connection : createBrowserClient('http://127.0.0.1:4179', async () => null);
      if (base.kind !== 'configured') throw new Error('Missing loopback client');
      const projected = input.workspace ?? (input.videos ? workspaceSchema.parse({ ...workspace, videos: ['queued', 'submitting', 'running', 'succeeded', 'failed', 'cancelled'].map((status, index) => generationRequestSchema.parse({ id: `request-${status}`, batchId: 'read-only-batch', proposalId: 'read-only-proposal', purpose: 'shot_video', target: { shotId: 'shot-a' }, status, remote: { taskId: `private-remote-${index}` }, ...(status === 'succeeded' ? { resultVersionId: 'video-v2' } : {}) })), storyboard: { ...workspace.storyboard, shots: workspace.storyboard.shots.map(shot => shot.shotId === 'shot-a' ? { ...shot, chosenVideoVersionId: 'video-v1' } : shot) } }) : workspace);
      const video = versionSchema.parse({ id: 'video-v2', artifactId: 'video-artifact', revision: 2, kind: 'video', media: { contentType: 'video/mp4', byteSize: 456, width: 1280, height: 720, durationMs: 5100 }, createdBy: 'assistant', createdAt: '2026-10-28T00:00:00Z', dependencies: ['panel-image-v2'] });
      root.render(<Shell videoPrerequisites={{ versions: [video, versionSchema.parse({ ...video, id: 'video-v1', revision: 1 })] }} connection={{ kind: 'configured', client: { ...base.client, native: { ...base.client.native, stop: async () => { nativeStopCalls++; throw new Error('Request cancellation must never call native Stop'); } }, workspace: async () => ({ ok: true, value: projected }) } }} session={{ accountId: input.accountId ?? 'read-only-account', name: 'Read-only test account' }} conversationId={input.conversationId ?? 'read-only-conversation'} />);
      return;
    }
    root.render(<div className="wp-panel-body" style={{ width: 380 }}><PlanningEditor connection={connection} scope={{ accountId: input.accountId ?? 'read-only-account', conversationId: input.conversationId ?? 'read-only-conversation' }} workspace={input.workspace ?? workspace} target={input.shot ? { kind: 'shot', shotId: 'shot-a' } : { kind: 'panel', shotId: 'shot-a', panelId: 'panel-b' }} onEdited={() => { throw new Error('This composition only qualifies real backend failures, not successful persistence'); }} /></div>);
  },
  unmount() { root.render(null); },
  nativeStopCalls() { return nativeStopCalls; },
};
