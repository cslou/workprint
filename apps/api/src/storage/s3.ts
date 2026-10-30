import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageError, storageError } from './errors.js';

export const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
export const MAX_STORAGE_CONCURRENCY = 2;
export const MAX_STORAGE_MS = 10000;
export const MAX_UPLOAD_URL_SECONDS = 300;
export type PrivateStorageConfiguration = Readonly<{ endpoint: string; region: string; bucket: string; credentials: Readonly<{ accessKeyId: string; secretAccessKey: string }> }>;
export type StoredSnapshot = Readonly<{ bytes: Buffer; byteSize: number; contentType: string; etag: string; sha256: string }>;
export type PutGrant = Readonly<{ key: string; byteSize: number; contentType: string; issuedAt: Date; expiresAt: Date }>;
export type PrivateObjectStorage = Readonly<{
  presignPut(input: PutGrant): Promise<string>;
  read(key: string, maxBytes?: number): Promise<StoredSnapshot>;
  publish(key: string, bytes: Uint8Array, contentType: string): Promise<Readonly<{ etag: string; sha256: string; byteSize: number }>>;
  remove(key: string): Promise<void>;
  close(): void;
}>;
const keyIs = (key: string, prefixes: readonly string[]) => key.length <= 300 && /^(staging|published|posters)\/[A-Za-z0-9/-]+$/.test(key) && prefixes.includes(key.split('/')[0]!);
const boundedSize = (size: unknown, maximum: number) => typeof size === 'number' && Number.isSafeInteger(size) && size > 0 && size <= maximum;
const validType = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(value) && value.length <= 100;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Mechanical S3 capabilities only. Callers own authorization, verification and publication policy. */
export function createPrivateObjectStorage(configuration: PrivateStorageConfiguration, limits: Readonly<{ maxBytes?: number; timeoutMs?: number; concurrency?: number }> = {}): PrivateObjectStorage {
  let endpoint: URL;
  try { endpoint = new URL(configuration.endpoint); } catch { throw new StorageError('unavailable', 'configuration'); }
  const maxBytes = limits.maxBytes ?? MAX_OBJECT_BYTES, timeoutMs = limits.timeoutMs ?? MAX_STORAGE_MS, concurrency = limits.concurrency ?? MAX_STORAGE_CONCURRENCY;
  if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(configuration.bucket) || !/^[a-z0-9-]{1,32}$/.test(configuration.region) || !configuration.credentials.accessKeyId || !configuration.credentials.secretAccessKey || !boundedSize(maxBytes, MAX_OBJECT_BYTES) || !boundedSize(timeoutMs, MAX_STORAGE_MS) || !boundedSize(concurrency, MAX_STORAGE_CONCURRENCY)) throw new StorageError('unavailable', 'configuration');
  const client = new S3Client({ ...configuration, endpoint: endpoint.origin, forcePathStyle: true, maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  let active = 0, closed = false;
  const run = async <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (closed || active >= concurrency) throw new StorageError('unavailable', 'capacity');
    active++;
    const signal = AbortSignal.timeout(timeoutMs);
    try { const result = await operation(signal); signal.throwIfAborted(); return result; }
    catch (error) { throw storageError(error); }
    finally { active--; }
  };
  const assertKey = (key: string, prefixes: readonly string[]) => { if (!keyIs(key, prefixes)) throw new StorageError('invalid_object'); };
  return Object.freeze({
    presignPut: async (input: PutGrant) => {
      assertKey(input.key, ['staging']);
      const seconds = (input.expiresAt.getTime() - input.issuedAt.getTime()) / 1000;
      if (!boundedSize(input.byteSize, maxBytes) || !validType(input.contentType) || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_UPLOAD_URL_SECONDS || input.issuedAt.getTime() > Date.now() + 1000) throw new StorageError('invalid_object');
      if (input.expiresAt.getTime() <= Date.now()) throw new StorageError('expired');
      return run(async () => getSignedUrl(client, new PutObjectCommand({ Bucket: configuration.bucket, Key: input.key, ContentType: input.contentType, ContentLength: input.byteSize }), { signingDate: input.issuedAt, expiresIn: seconds, signableHeaders: new Set(['content-type', 'content-length']) }));
    },
    read: async (key: string, requestedMaximum = maxBytes) => {
      assertKey(key, ['staging', 'published', 'posters']);
      if (!boundedSize(requestedMaximum, maxBytes)) throw new StorageError('invalid_object');
      return run(async signal => {
        const head = await client.send(new HeadObjectCommand({ Bucket: configuration.bucket, Key: key }), { abortSignal: signal });
        if (!boundedSize(head.ContentLength, requestedMaximum) || !validType(head.ContentType) || !head.ETag || head.ETag.length > 200) throw new StorageError('invalid_object');
        const output = await client.send(new GetObjectCommand({ Bucket: configuration.bucket, Key: key, IfMatch: head.ETag }), { abortSignal: signal });
        const body = output.Body;
        if (!(body instanceof Readable)) throw new StorageError('unavailable', 'response');
        const abort = () => body.destroy(new Error('Private object body deadline exceeded'));
        signal.addEventListener('abort', abort, { once: true });
        try {
          if (output.ContentLength !== head.ContentLength || output.ContentType !== head.ContentType || output.ETag !== head.ETag) throw new StorageError('invalid_object');
          const chunks: Buffer[] = []; let byteSize = 0;
          for await (const chunk of body as AsyncIterable<unknown>) {
            signal.throwIfAborted();
            if (!(chunk instanceof Uint8Array)) throw new StorageError('invalid_object');
            byteSize += chunk.byteLength;
            if (byteSize > requestedMaximum || byteSize > head.ContentLength!) throw new StorageError('invalid_object');
            chunks.push(Buffer.from(chunk));
          }
          if (byteSize !== head.ContentLength) throw new StorageError('invalid_object');
          const bytes = Buffer.concat(chunks, byteSize);
          return { bytes, byteSize, contentType: head.ContentType!, etag: head.ETag, sha256: hash(bytes) };
        } finally { signal.removeEventListener('abort', abort); body.destroy(); }
      });
    },
    publish: async (key: string, bytes: Uint8Array, contentType: string) => {
      assertKey(key, ['published', 'posters']);
      if (!boundedSize(bytes.byteLength, maxBytes) || !validType(contentType)) throw new StorageError('invalid_object');
      return run(async signal => {
        const snapshot = Buffer.from(bytes);
        const output = await client.send(new PutObjectCommand({ Bucket: configuration.bucket, Key: key, Body: snapshot, ContentType: contentType, ContentLength: snapshot.length, IfNoneMatch: '*' }), { abortSignal: signal });
        if (!output.ETag || output.$metadata.httpStatusCode !== 200) throw new StorageError('unavailable', 'response');
        return { etag: output.ETag, byteSize: snapshot.length, sha256: hash(snapshot) };
      });
    },
    remove: async (key: string) => {
      assertKey(key, ['staging', 'published', 'posters']);
      return run(async signal => {
        const output = await client.send(new DeleteObjectCommand({ Bucket: configuration.bucket, Key: key }), { abortSignal: signal });
        if (output.$metadata.httpStatusCode !== 204) throw new StorageError('unavailable', 'response');
      });
    },
    close: () => { closed = true; client.destroy(); },
  });
}
