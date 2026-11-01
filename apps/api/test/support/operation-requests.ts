import type { OperationName, OperationRequest } from '@workprint/contracts';

const params = { id: 'unimplemented-resource' };
const query = {};
const body = {};
const operationId = 'operation-1';
export const applicationRequests: { [N in OperationName]: OperationRequest<N> } = {
  workspace: { params, query, body }, artifactVersions: { params, query, body }, version: { params, query, body },
  library: { params: {}, query: { limit: 10 }, body },
  saveVersion: { params, query, body: { operationId, kind: 'script', content: {}, dependencies: [] } },
  useVersion: { params, query, body: { operationId, versionId: 'v', purpose: 'panel_image', shotId: 's', panelId: 'p' } },
  editStoryboard: { params, query, body: { operationId, baseVersionId: 'base-v', shots: [{ shotId: 's', order: 0, panels: [{ panelId: 'p', order: 0, references: ['reference-v'] }] }] } },
  question: { params, query, body },
  answerQuestion: { params, query, body: { operationId, questionRevision: 2, optionId: 'approve' } },
  proposal: { params, query, body },
  requestUpload: { params, query, body: { operationId, kind: 'image', filename: 'image.png', contentType: 'image/png', byteSize: 1024 } },
  confirmUpload: { params, query, body: { operationId } }, media: { params, query, body },
  generationRequest: { params, query: { status: 'queued', limit: 5 }, body }, generationRequests: { params, query, body },
  cancelGeneration: { params, query, body: { operationId } },
  createExport: { params, query, body: { operationId, selectionRevision: 7 } },
  exports: { params, query, body }, export: { params, query, body },
};
