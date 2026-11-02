import { ArtifactError, UploadError } from '../artifacts/index.js';

/** Logs a failed in-process save or read by its error name and code only: never a message, path or private value. */
export const logFailure = (message: string, error: unknown) => console.error(message, { name: error instanceof Error ? error.name : 'unknown', ...(error instanceof UploadError || error instanceof ArtifactError ? { code: error.code } : {}) });
