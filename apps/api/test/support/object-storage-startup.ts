import { CreateBucketCommand, DeleteObjectCommand, PutBucketCorsCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { observeFixturePhase, type FixtureDiagnostic } from './fixture-observation.js';

/** Private fixture initialization only. No retries, product I/O deadline changes or skipped readiness write. */
export async function initializeObjectStorage(client: S3Client, input: { bucket: string; owner: string; origins: readonly string[] }, diagnostic?: FixtureDiagnostic): Promise<void> {
  const { bucket, owner, origins } = input;
  await observeFixturePhase('s3.create-bucket', () => client.send(new CreateBucketCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(3000) }), diagnostic);
  await observeFixturePhase('s3.configure-cors', () => client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [{ AllowedOrigins: [...origins], AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['content-type', 'content-length', 'x-amz-content-sha256'], ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type', 'Content-Range', 'Accept-Ranges'], MaxAgeSeconds: 60 }] } }), { abortSignal: AbortSignal.timeout(3000) }), diagnostic);
  // A new single-node cluster defers volume-ID allocation during its initial lease.
  const readinessKey = `fixture-readiness/${owner}`;
  await observeFixturePhase('s3.readiness-write', () => client.send(new PutObjectCommand({ Bucket: bucket, Key: readinessKey, Body: Buffer.from('storage ready'), ContentLength: 13, ContentType: 'application/octet-stream' }), { abortSignal: AbortSignal.timeout(30000) }), diagnostic);
  await observeFixturePhase('s3.readiness-delete', () => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: readinessKey }), { abortSignal: AbortSignal.timeout(3000) }), diagnostic);
}
