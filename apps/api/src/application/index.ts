import { applicationError, operations, type ErrorEnvelope, type OperationName } from '@workprint/contracts';

/** Supplied by the admission adapter, never read from the request payload. */
export type Admission = import('./admission.js').Admission;
export type Authenticate = () => Promise<Admission>;
export type OwnedConversationOutcome = { kind: 'owned' } | { kind: 'not_found' } | { kind: 'unavailable'; reason: 'native_storage' };
/** accountId is supplied by verified admission, never by caller owner claims. */
export type CheckOwnedConversation = (accountId: string, conversationId: string) => Promise<OwnedConversationOutcome>;
export type ApplicationCollaborators = Readonly<{ checkOwnedConversation: CheckOwnedConversation }>;
export type UnavailableBoundary = (input: unknown, authenticate: Authenticate) => Promise<ErrorEnvelope>;

function boundary(name: OperationName): UnavailableBoundary {
  return async (input, authenticate) => {
    const admission = await authenticate();
    if (admission.kind === 'unauthorized') return applicationError('unauthenticated', 'Authentication required');
    if (admission.kind === 'unavailable') return applicationError('integration_failure', 'Authentication unavailable');
    if (!operations[name].request.safeParse(input).success) return applicationError('invalid_input', 'Invalid application request');
    // There are no implemented resources to authorize here. Functional owners
    // must add real ownership checks before replacing this unavailable result.
    return applicationError('not_implemented', 'This operation is not implemented');
  };
}

/** In-process boundaries only; Story 5 owns route mounting and client transport. */
export const unavailableApplication = {
  workspace: boundary('workspace'),
  artifactVersions: boundary('artifactVersions'),
  version: boundary('version'),
  library: boundary('library'),
  saveVersion: boundary('saveVersion'),
  useVersion: boundary('useVersion'),
  editStoryboard: boundary('editStoryboard'),
  question: boundary('question'),
  answerQuestion: boundary('answerQuestion'),
  proposal: boundary('proposal'),
  requestUpload: boundary('requestUpload'),
  confirmUpload: boundary('confirmUpload'),
  media: boundary('media'),
  generationRequest: boundary('generationRequest'),
  generationRequests: boundary('generationRequests'),
  cancelGeneration: boundary('cancelGeneration'),
  createExport: boundary('createExport'),
  exports: boundary('exports'),
  export: boundary('export'),
} satisfies Record<OperationName, UnavailableBoundary>;

/** Composition supplies trusted reads without enabling any application operation. */
export function createApplication(collaborators: ApplicationCollaborators) {
  return { operations: unavailableApplication, checkOwnedConversation: collaborators.checkOwnedConversation };
}
export type Application = ReturnType<typeof createApplication>;
export { withUploads, type UploadApplication } from './uploads.js';
export { withManualSaves, type ManualSaveApplication } from './manual-saves.js';
export { withVersionUses, type VersionUseApplication } from './version-uses.js';
export { publicJob, withGenerationRequests, type GenerationJobReads, type GenerationRequestApplication } from './generation-requests.js';
export { withSavedWork, type SavedWorkApplication, type SavedWorkReads } from './saved-reads.js';
export { withStoryboardEdits, type StoryboardEditApplication } from './storyboard-edits.js';
export { createWorkspaceReader, type OwnedWorkspace, type OwnedWorkspaceRead, type ReadOwnedWorkspace } from './workspace-reads.js';
export { createAssistantScriptSaver, type AssistantScriptOutcome, type SaveAssistantScript } from './assistant-scripts.js';
export { createGeneratedImageSaver, createImageInputReader, type GeneratedImageOutcome, type ImageInputsOutcome, type ReadImageInputs, type SaveGeneratedImage } from './generated-images.js';
export { createGeneratedVideoSaver, type GeneratedVideoOutcome, type SaveGeneratedVideo } from './generated-videos.js';
export { createVideoJobs, videoJobTiming, type NewVideo, type VideoAbortReason, type VideoJobCollaborators, type VideoJobOutcome, type VideoJobs, type VideoJobTiming, type VideoProviderFailure, type VideoRunControl } from './video-jobs.js';
