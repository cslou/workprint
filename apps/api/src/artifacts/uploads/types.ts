import type { OperationRequest, OperationResponse, Version } from '@workprint/contracts';
import type { PrivateObjectStorage } from '../../storage/index.js';
import type { createArtifactStore } from '../store.js';

export type UploadRequest = OperationRequest<'requestUpload'>['body'];
export type UploadResult = OperationResponse<'confirmUpload'>;
export type OwnedCheck = Parameters<typeof createArtifactStore>[1];
export type VerifiedMedia = Readonly<{ kind: 'image' | 'video'; contentType: string; byteSize: number; width: number; height: number; durationMs?: number; hasAudio?: boolean; poster?: Readonly<{ bytes: Uint8Array; contentType: 'image/png' | 'image/jpeg' }> }>;
/** Trusted inspection capability. Production supplies none until real media inspection exists. */
export type MediaVerifier = (input: Readonly<{ kind: 'image' | 'video'; bytes: Uint8Array; contentType: string; signal: AbortSignal }>) => Promise<VerifiedMedia>;
export type UploadCollaborators = Readonly<{ storage?: PrivateObjectStorage; verifyMedia?: MediaVerifier }>;
export type UploadRow = {
  owner_id: string; upload_id: string; conversation_id: string; request_operation_id: string; payload_hash: string;
  kind: 'image' | 'video'; content_type: string; byte_size: string; intended_use: UploadRequest['intendedUse'] | null;
  target_version_id: string | null; staging_key: string; issued_at: Date; expires_at: Date;
  state: 'pending' | 'processing' | 'confirmed'; lease_token: string | null; lease_expires_at: Date | null;
  cleanup_token: string | null; cleanup_expires_at: Date | null; confirmed_result: unknown; attempt_count: number;
};
export type MediaVersion = Extract<Version, { kind: 'image' | 'video' }>;
