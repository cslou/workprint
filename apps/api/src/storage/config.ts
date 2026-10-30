import { createPrivateObjectStorage, type PrivateObjectStorage } from './s3.js';
import { StorageError } from './errors.js';

/** Documented backend-only configuration; no credential discovery, test switch or cloud fallback. */
export function configuredObjectStorage(environment: Readonly<Record<string, string | undefined>>): PrivateObjectStorage | undefined {
  const fields = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
  if (fields.every(field => environment[field] === undefined)) return undefined;
  const endpoint = environment.S3_ENDPOINT, bucket = environment.S3_BUCKET, accessKeyId = environment.S3_ACCESS_KEY_ID, secretAccessKey = environment.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new StorageError('unavailable', 'configuration');
  return createPrivateObjectStorage({ endpoint, bucket, region: environment.S3_REGION ?? 'auto', credentials: { accessKeyId, secretAccessKey } });
}
