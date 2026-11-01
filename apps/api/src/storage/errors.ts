import { S3ServiceException } from '@aws-sdk/client-s3';

export type StorageFailure = 'not_found' | 'denied' | 'conflict' | 'invalid_object' | 'expired' | 'unavailable';
/** Never retain SDK requests, response bodies, credentials or signed URLs in an error. */
export class StorageError extends Error {
  constructor(readonly code: StorageFailure, readonly source?: string, readonly status?: number) {
    super(`Private object storage: ${code}`); this.name = 'StorageError';
  }
}
export function storageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const status = error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
  const source = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name) ? error.name : 'unknown';
  return new StorageError(status === 404 ? 'not_found' : status === 403 ? 'denied' : status === 412 ? 'conflict' : 'unavailable', source, status);
}
