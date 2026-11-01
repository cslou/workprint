import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ApiClient, ClientResult } from '@workprint/api-client';
import { versionSchema, useBindingSchema, type OperationResponse, type Version } from '@workprint/contracts';
import { createBrowserClient } from '../src/api/client.js';
import { Videos, type VideoPrerequisites } from '../src/videos/videos.js';
import type { StoryboardPrerequisites } from '../src/storyboard/presentation.js';
import { Storyboard } from '../src/storyboard/storyboard.js';
import { applyUsedEffects } from '../src/workspace/used.js';
import { workspace, video, image } from './storyboard-fixtures.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Explicit read-only projections and controlled command acknowledgements for reconciliation only.
// These are not a successful product backend or evidence of persisted approvals.
const videos = [versionSchema.parse({ ...video, id: 'video-v1', revision: 1 }), video];
const images = [versionSchema.parse({ ...image, id: 'panel-image-v1', revision: 1 }), image];
const base = createBrowserClient(window.location.origin, async () => null);
if (base.kind !== 'configured') throw new Error('Missing loopback client');
const pending: { body: Parameters<ApiClient['useVersion']>[0]['body']; resolve(value: ClientResult<OperationResponse<'useVersion'>>): void }[] = [];
const client: ApiClient = { ...base.client,
  version: async request => { const value = [...videos, ...images].find(version => version.id === request.params.id); if (!value) throw new Error('Unknown read-only version'); return { ok: true, value }; },
  artifactVersions: async () => ({ ok: true, value: { items: [], nextCursor: null } }),
  generationRequests: async () => ({ ok: true, value: { items: [], nextCursor: null } }),
  useVersion: request => new Promise(resolve => pending.push({ body: request.body, resolve })),
};
const node = document.getElementById('root'); if (!node) throw new Error('Missing selection race root');
const root = createRoot(node);
const projection = { ...workspace, storyboard: { ...workspace.storyboard, shots: workspace.storyboard.shots.map(shot => ({ ...shot, chosenVideoVersionId: videos[0]!.id, panels: shot.panels.map(panel => ({ ...panel, approvedImageVersionId: images[0]!.id, candidateImageVersions: images })) })) }, videos: videos.map((version, index) => ({ id: `candidate-${index}`, batchId: 'batch', proposalId: 'proposal', purpose: 'shot_video' as const, target: { shotId: 'shot-a' }, status: 'succeeded' as const, resultVersionId: version.id, remote: {} })) };
// Composed mode applies confirmed use receipts the way the shell does, including an unrelated Script use.
const script = versionSchema.parse({ id: 'script-v3', artifactId: 'script-artifact', revision: 3, kind: 'script', content: {}, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: [] });
let useScript: (selectionRevision: number) => void = () => { throw new Error('Composed mode is not mounted'); };
let composedRevision = -1;
function Composed({ initial, common }: { initial: OperationResponse<'workspace'>; common: Omit<Parameters<typeof Videos>[0], 'workspace'> }) {
  // Receipts accumulate and apply through the shell's ordering function, in arrival order.
  const [effects, setEffects] = useState<{ result: OperationResponse<'useVersion'>; version: Version }[]>([]);
  const workspace = applyUsedEffects(initial, effects);
  composedRevision = workspace.selectionRevision;
  useScript = selectionRevision => setEffects(current => [...current, { result: { use: { id: 'script-use', versionId: script.id, binding: { purpose: 'script' }, state: 'approved' }, selectionRevision }, version: script }]);
  return <Videos {...common} workspace={workspace} onUsed={(result, version) => setEffects(current => [...current, { result, version }])} />;
}
(window as unknown as { selectionRace: unknown }).selectionRace = {
  configure(mode: 'video' | 'panel', options: { storyboardFacts?: StoryboardPrerequisites; videoFacts?: VideoPrerequisites; foreignShot?: boolean; bound?: boolean; composed?: boolean } = {}) {
    // Bound mode: owned videos already attached to the Shot, with no generation request and no choice yet.
    const bound = { ...projection, videos: [], storyboard: { ...projection.storyboard, shots: projection.storyboard.shots.map(shot => ({ ...shot, chosenVideoVersionId: null, candidateVideoVersions: videos })) } };
    const displayed = options.bound ? bound : options.foreignShot ? { ...projection, videos: projection.videos.map(request => ({ ...request, target: { shotId: 'unrelated-shot' } })) } : projection;
    const common = { connection: { kind: 'configured' as const, client }, scope: { accountId: 'read-only-account', conversationId: 'read-only-conversation' }, workspace: displayed };
    if (options.composed) { root.render(<div className="wp-panel-body" style={{ width: 380 }}><Composed initial={{ ...displayed, storyboard: { ...displayed.storyboard, shots: displayed.storyboard.shots.map(shot => ({ ...shot, chosenVideoVersionId: videos[0]!.id })) } }} common={{ connection: common.connection, scope: common.scope, prerequisites: options.videoFacts ?? { versions: videos } }} /></div>); return; }
    root.render(<div className="wp-panel-body" style={{ width: 380 }}>{mode === 'video' ? <Videos {...common} prerequisites={options.videoFacts ?? { versions: videos }} /> : <Storyboard {...common} {...(options.storyboardFacts ? { prerequisites: options.storyboardFacts } : {})} />}</div>);
  },
  pending() { return pending.length; },
  useScript(selectionRevision: number) { useScript(selectionRevision); },
  composedRevision() { return composedRevision; },
  complete(versionId: string, selectionRevision: number) { const index = pending.findIndex(value => value.body.versionId === versionId); if (index < 0) throw new Error('Missing controlled command'); const command = pending.splice(index, 1)[0]!; const binding = useBindingSchema.parse(Object.fromEntries(Object.entries(command.body).filter(([key]) => key !== 'operationId' && key !== 'versionId'))); command.resolve({ ok: true, value: { use: { id: `ack-${selectionRevision}`, versionId, binding, state: 'approved' }, selectionRevision } }); },
};
