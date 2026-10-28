import type { CallOptions } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';

/** Plain action feedback shared by the composer and the isolated confirmation consumer. */
export const uploadFeedback = {
  unavailable: 'Uploading files is not available yet. The file was not sent.',
  unauthenticated: 'Sign-in required to upload a file. The file was not sent.',
  error: 'The file was not uploaded. Nothing was changed.',
  unsupported: 'That file is not an image or video. The file was not sent.',
} as const;

export const confirmFeedback = {
  unavailable: 'Confirming this upload is not available yet. No version was created.',
  unauthenticated: 'Sign-in required to confirm this upload. No version was created.',
  error: 'This upload was not confirmed. No version was created.',
} as const;

export type UploadKind = 'image' | 'video';
export type UploadOutcome =
  | Readonly<{ kind: 'initiated'; uploadId: string; maxBytes: number }>
  | Readonly<{ kind: keyof typeof uploadFeedback; feedback: string }>;
export type ConfirmOutcome =
  | Readonly<{ kind: 'saved'; value: OperationResponse<'confirmUpload'> }>
  | Readonly<{ kind: keyof typeof confirmFeedback; feedback: string }>;

const failureKey = (code: string): keyof typeof uploadFeedback => code === 'unauthenticated' ? 'unauthenticated' : code === 'not_implemented' ? 'unavailable' : 'error';
const confirmFailureKey = (code: string): keyof typeof confirmFeedback => code === 'unauthenticated' ? 'unauthenticated' : code === 'not_implemented' ? 'unavailable' : 'error';

/** The actual selected file decides the kind; anything else is never sent. */
export function uploadKind(type: string): UploadKind | null {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return null;
}

/**
 * One initiation consumer. It never transfers bytes and never confirms; a selected local file is
 * never a version. Without an intended conversation it makes no request.
 */
export async function initiateUpload(connection: BrowserClient, conversationId: string | undefined, file: File, options: CallOptions = {}): Promise<UploadOutcome> {
  const kind = uploadKind(file.type);
  if (!kind) return { kind: 'unsupported', feedback: uploadFeedback.unsupported };
  if (connection.kind !== 'configured' || !conversationId) return { kind: 'unavailable', feedback: uploadFeedback.unavailable };
  const result = await connection.client.requestUpload({
    params: { id: conversationId },
    query: {},
    body: { operationId: crypto.randomUUID(), kind, filename: file.name, contentType: file.type, byteSize: file.size, intendedUse: { purpose: 'reference' } },
  }, options);
  if (!result.ok) return { kind: failureKey(result.error.code), feedback: uploadFeedback[failureKey(result.error.code)] };
  return { kind: 'initiated', uploadId: result.value.uploadId, maxBytes: result.value.maxBytes };
}

/**
 * The actual confirmation consumer for a supplied upload identity. No production control reaches it
 * before a completed transfer, which this milestone does not implement. A 501 exposes no version.
 */
export async function confirmUpload(connection: BrowserClient, uploadId: string, options: CallOptions = {}): Promise<ConfirmOutcome> {
  if (connection.kind !== 'configured') return { kind: 'unavailable', feedback: confirmFeedback.unavailable };
  const result = await connection.client.confirmUpload({ params: { id: uploadId }, query: {}, body: { operationId: crypto.randomUUID() } }, options);
  if (!result.ok) {
    const key = confirmFailureKey(result.error.code);
    return { kind: key, feedback: confirmFeedback[key] };
  }
  return { kind: 'saved', value: result.value };
}
