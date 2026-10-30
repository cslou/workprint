import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CreateBucketCommand, DeleteObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Docker Hub OCI index resolved before first use; never execute the mutable tag alone.
export const SEAWEED_IMAGE = 'chrislusf/seaweedfs:4.51@sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8';
const digest = SEAWEED_IMAGE.slice(SEAWEED_IMAGE.indexOf('@') + 1);
const exec = promisify(execFile);
const docker = async (...args: string[]) => (await exec('docker', args, { timeout: 90000, maxBuffer: 1024 * 1024 })).stdout.trim();
export type ObjectStorageFixture = Readonly<{
  endpoint: string; bucket: string; credentials: { accessKeyId: string; secretAccessKey: string };
  client: S3Client; foreign: S3Client; close(): Promise<void>;
}>;

/** Unique private local service only; no R2 target, shared bucket or account mutation. */
export async function isolatedObjectStorage(origins: readonly string[] = ['http://127.0.0.1:4279', 'http://127.0.0.1:4280'], diagnostic?: (message: string) => void): Promise<ObjectStorageFixture> {
  const owner = randomUUID(), name = `workprint-s3-fixture-${owner}`, bucket = `workprint-${owner}`;
  const directory = await mkdtemp(join(tmpdir(), 'workprint-s3-'));
  await chmod(directory, 0o700);
  const credentials = { accessKeyId: randomBytes(12).toString('hex'), secretAccessKey: randomBytes(32).toString('hex') };
  const foreignCredentials = { accessKeyId: randomBytes(12).toString('hex'), secretAccessKey: randomBytes(32).toString('hex') };
  const configuration = join(directory, 'identities.json');
  let acquisitionStarted = false, closed = false, client: S3Client | undefined, foreign: S3Client | undefined;
  const close = async () => {
    if (closed) return;
    client?.destroy(); foreign?.destroy();
    if (acquisitionStarted) {
      let inspected: string;
      try { inspected = await docker('inspect', name); }
      catch (error) {
        if (!(error instanceof Error) || !('stderr' in error) || typeof error.stderr !== 'string' || !error.stderr.includes('No such object')) throw error;
        inspected = '[]';
      }
      const records = JSON.parse(inspected) as { Id: string; Name: string; Config: { Labels: Record<string, string> } }[];
      if (records.length) {
        const record = records[0];
        if (records.length !== 1 || !record || record.Name !== `/${name}` || record.Config.Labels['workprint.s3-fixture'] !== owner) throw new Error('Object-storage fixture ownership changed; preserving resources');
        await docker('rm', '--force', record.Id);
      }
    }
    await rm(directory, { recursive: true }); closed = true;
  };
  try {
    await writeFile(configuration, JSON.stringify({ identities: [
      { name: owner, credentials: [{ accessKey: credentials.accessKeyId, secretKey: credentials.secretAccessKey }], actions: ['Admin', 'Read', 'List', 'Write', 'Tagging'].map(action => `${action}:${bucket}`) },
      { name: `${owner}-foreign`, credentials: [{ accessKey: foreignCredentials.accessKeyId, secretKey: foreignCredentials.secretAccessKey }], actions: [`Read:other-${owner}`, `Write:other-${owner}`] },
    ] }), { mode: 0o600 });
    await docker('pull', SEAWEED_IMAGE);
    const images = JSON.parse(await docker('image', 'inspect', SEAWEED_IMAGE)) as { RepoDigests: string[] }[];
    if (images.length !== 1 || !images[0]?.RepoDigests.includes(`chrislusf/seaweedfs@${digest}`)) throw new Error('Object-storage image digest was not verified');
    acquisitionStarted = true;
    await docker('create', '--name', name, '--label', `workprint.s3-fixture=${owner}`, '--publish', '127.0.0.1::8333', '--tmpfs', '/data:rw,nosuid,nodev', '--mount', `type=bind,src=${configuration},dst=/etc/workprint-s3.json,readonly`, SEAWEED_IMAGE, 'server', '-dir=/data', '-ip=127.0.0.1', '-ip.bind=0.0.0.0', '-s3', '-s3.config=/etc/workprint-s3.json');
    await docker('start', name);
    const binding = /^127\.0\.0\.1:(\d+)$/.exec(await docker('port', name, '8333/tcp'));
    if (!binding) throw new Error('Object-storage fixture did not bind a dynamic loopback port');
    const endpoint = `http://127.0.0.1:${binding[1]}`;
    const deadline = Date.now() + 20000;
    for (;;) {
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(500) });
        await response.body?.cancel();
        if (response.status === 403) break;
        if (response.status === 200) throw new Error('Private object-storage fixture allowed unsigned access');
      } catch (error) {
        if (error instanceof Error && error.message === 'Private object-storage fixture allowed unsigned access') throw error;
      }
      if (Date.now() >= deadline) throw new Error('Private object-storage fixture did not become ready');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const clientConfiguration = { endpoint, region: 'us-east-1', forcePathStyle: true, maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED' as const, responseChecksumValidation: 'WHEN_REQUIRED' as const };
    client = new S3Client({ ...clientConfiguration, credentials }); foreign = new S3Client({ ...clientConfiguration, credentials: foreignCredentials });
    await client.send(new CreateBucketCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(3000) });
    await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [{ AllowedOrigins: [...origins], AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['content-type', 'content-length', 'x-amz-content-sha256'], ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type', 'Content-Range', 'Accept-Ranges'], MaxAgeSeconds: 60 }] } }), { abortSignal: AbortSignal.timeout(3000) });
    // A new single-node cluster defers volume-ID allocation during its initial lease.
    // Readiness includes one real write; this startup bound is not the product I/O deadline.
    const readinessKey = `fixture-readiness/${owner}`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: readinessKey, Body: Buffer.from('storage ready'), ContentLength: 13, ContentType: 'application/octet-stream' }), { abortSignal: AbortSignal.timeout(30000) });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: readinessKey }), { abortSignal: AbortSignal.timeout(3000) });
    return { endpoint, bucket, credentials, client, foreign, close };
  } catch (error) {
    if (acquisitionStarted && diagnostic) {
      try {
        const output = await exec('docker', ['logs', name], { timeout: 3000, maxBuffer: 65536 });
        let logs = output.stdout + output.stderr;
        for (const secret of [...Object.values(credentials), ...Object.values(foreignCredentials)]) logs = logs.replaceAll(secret, '[redacted]');
        diagnostic(logs.replace(/(X-Amz-[^=&\s]+|Signature)=[^&\s]+/gi, '$1=[redacted]').slice(-12000));
      } catch (logError) { diagnostic(`Owned object-storage logs unavailable: ${logError instanceof Error ? logError.name : 'unknown error'}`); }
    }
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Object-storage fixture setup/owned cleanup failed', { cause: cleanupError }); }
    throw error;
  }
}
