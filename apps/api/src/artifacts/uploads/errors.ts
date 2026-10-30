import { ArtifactError } from '../errors.js';
import { StorageError } from '../../storage/index.js';

export class UploadError extends Error {
  constructor(readonly code: 'not_found' | 'invalid_input' | 'stale_revision' | 'unsupported' | 'not_implemented' | 'integration_failure', message?: string) {
    super(message ?? (code === 'not_found' ? 'Saved work not found' : code === 'invalid_input' ? 'Invalid upload request' : code === 'unsupported' ? 'Unsupported upload' : code === 'stale_revision' ? 'The upload target changed' : code === 'not_implemented' ? 'Media verification is not available' : 'Upload unavailable'));
  }
}
export function uploadError(error: unknown): UploadError {
  if (error instanceof UploadError) return error;
  if (error instanceof ArtifactError) return new UploadError(error.code, error.message);
  if (error instanceof StorageError) return new UploadError(error.code === 'not_found' ? 'not_found' : error.code === 'invalid_object' ? 'invalid_input' : 'integration_failure');
  return new UploadError('integration_failure');
}
