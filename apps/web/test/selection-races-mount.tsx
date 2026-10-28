import { createRoot } from 'react-dom/client';
import type { ApiClient, ClientResult } from '@workprint/api-client';
import { versionSchema, useBindingSchema, type OperationResponse } from '@workprint/contracts';
import { createBrowserClient } from '../src/api/client.js';
import { Videos } from '../src/videos/videos.js';
import { Storyboard } from '../src/storyboard/storyboard.js';
import { workspace, video, image } from './storyboard-fixtures.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Explicit read-only projections and controlled command acknowledgements for reconciliation only.
// These are not a successful product backend or evidence of persisted approvals.
const videos = [versionSchema.parse({ ...video, id: 'video-v1', revision: 1 }), video];
const images = [versionSchema.parse({ ...image, id: 'panel-image-v1', revision: 1 }), image];
const base = createBrowserClient('http://127.0.0.1:4179', async () => null);
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
(window as unknown as { selectionRace: unknown }).selectionRace = {
  configure(mode: 'video' | 'panel') { const common = { connection: { kind: 'configured' as const, client }, scope: { accountId: 'read-only-account', conversationId: 'read-only-conversation' }, workspace: projection }; root.render(<div className="wp-panel-body" style={{ width: 380 }}>{mode === 'video' ? <Videos {...common} prerequisites={{ versions: videos }} /> : <Storyboard {...common} />}</div>); },
  pending() { return pending.length; },
  complete(versionId: string, selectionRevision: number) { const index = pending.findIndex(value => value.body.versionId === versionId); if (index < 0) throw new Error('Missing controlled command'); const command = pending.splice(index, 1)[0]!; const binding = useBindingSchema.parse(Object.fromEntries(Object.entries(command.body).filter(([key]) => key !== 'operationId' && key !== 'versionId'))); command.resolve({ ok: true, value: { use: { id: `ack-${selectionRevision}`, versionId, binding, state: 'approved' }, selectionRevision } }); },
};
