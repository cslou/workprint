import type { OperationResponse, Version } from '../../packages/contracts/src/index.js';
import type { MaterialPrerequisites } from '../../apps/web/src/materials/presentation.js';

const base = { revision: 4, createdBy: 'human' as const, createdAt: '2026-10-29T00:00:00Z', dependencies: [] };
export const approvedImage: Version = { ...base, id: 'existing-panel-image-v4', artifactId: 'existing-panel-image', kind: 'image', media: { contentType: 'image/png', byteSize: 123, width: 128, height: 72 } };
export const chosenVideo: Version = { ...base, id: 'existing-shot-video-v4', artifactId: 'existing-shot-video', kind: 'video', media: { contentType: 'video/mp4', byteSize: 456, width: 128, height: 72, durationMs: 4000 } };
export const reference: Version = { ...base, id: 'existing-reference-v4', artifactId: 'existing-reference', kind: 'reference', content: {} };
export const existingWorkspace: OperationResponse<'workspace'> = {
  script: null,
  assets: [{ version: reference, state: 'Ready', use: { id: 'existing-reference-approval', versionId: reference.id, binding: { purpose: 'reference' }, state: 'approved' } }],
  storyboard: { work: { version: { ...base, id: 'existing-board-v4', artifactId: 'existing-board', kind: 'storyboard', content: {} }, state: 'Draft', use: null }, shots: [{ shotId: 'existing-shot', order: 1, intent: 'Existing chosen Shot', chosenVideoVersionId: chosenVideo.id, panels: [{ panelId: 'existing-panel', order: 1, description: 'Existing approved Panel', references: [reference.id], candidateImageVersions: [approvedImage], approvedImageVersionId: approvedImage.id }] }] },
  videos: [{ id: 'existing-request', batchId: 'existing-batch', proposalId: 'existing-proposal', purpose: 'shot_video', target: { shotId: 'existing-shot' }, status: 'succeeded', resultVersionId: chosenVideo.id, remote: {} }],
  pendingQuestion: null, activeWork: [], selectionRevision: 9,
};
export const materialFacts: MaterialPrerequisites = { presentations: [{ versionId: reference.id, revision: reference.revision, name: 'Existing reference attachment', description: 'Labelled read-only reference', thumbnail: { src: '/references/assets/media-placeholder.svg', alt: 'Existing reference' }, sheet: { kicker: 'Reference', name: 'Existing reference attachment', summary: 'Read-only existing state', sections: [] } }] };
