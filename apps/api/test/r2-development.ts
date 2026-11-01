import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { observeFixturePhase, type FixtureDiagnostic } from './fixture-observation.js';

export const R2_DEVELOPMENT_FILE = 'outputs/r2-development.json';
export type DevelopmentR2 = Readonly<{ endpoint: string; bucket: string; credentials: Readonly<{ accessKeyId: string; secretAccessKey: string }> }>;
/** Qualification cannot run. Callers report NON-PASS; it is never a skip. */
export class R2QualificationBlocked extends Error { override name = 'R2QualificationBlocked'; }

const blocked = (reason: string) => new R2QualificationBlocked(`NON-PASS: real-R2 qualification is blocked: ${reason}. See Story 9 in docs/sprints/sprint-005.md.`);
const fields = ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const;
const prefixes = ['staging/', 'published/', 'posters/'] as const;

/**
 * Loads Lou's development bucket from an ignored file under this clone's outputs/.
 * Errors never echo file contents.
 */
export async function developmentR2Configuration(file = R2_DEVELOPMENT_FILE): Promise<DevelopmentR2> {
  const path = resolve(file);
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw blocked(`${file} is missing or is not JSON`); }
  try { await promisify(execFile)('git', ['check-ignore', '--quiet', path]); }
  catch { throw blocked(`${file} is not git-ignored`); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw blocked(`${file} must be a JSON object`);
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join() !== [...fields].sort().join() || fields.some(field => typeof value[field] !== 'string' || !value[field])) throw blocked(`${file} must contain exactly ${fields.join(', ')}`);
  const { endpoint, bucket, accessKeyId, secretAccessKey } = value as Record<(typeof fields)[number], string>;
  if (!/^https:\/\/[0-9a-f]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint)) throw blocked('endpoint must be the account S3 origin https://<account-id>.r2.cloudflarestorage.com');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw blocked('bucket is not a valid R2 bucket name');
  return Object.freeze({ endpoint, bucket, credentials: Object.freeze({ accessKeyId, secretAccessKey }) });
}

/** Verifies the bucket's exact-origin CORS rule by preflight; the object-scoped token cannot read or change bucket settings. */
export async function verifyDevelopmentCors(target: DevelopmentR2, allowed: readonly string[], disallowed = 'http://127.0.0.1:9'): Promise<void> {
  const probe = `${target.endpoint}/${target.bucket}/staging/cors-preflight-probe`;
  const preflight = async (origin: string, method: 'PUT' | 'GET') => {
    const response = await fetch(probe, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, ...(method === 'PUT' ? { 'Access-Control-Request-Headers': 'content-type' } : {}) }, signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    return { status: response.status, origin: response.headers.get('access-control-allow-origin'), methods: (response.headers.get('access-control-allow-methods') ?? '').toUpperCase() };
  };
  for (const origin of allowed) for (const method of ['PUT', 'GET'] as const) {
    const result = await preflight(origin, method);
    if (result.origin !== origin || !result.methods.includes(method)) throw new Error(`R2 CORS rule does not allow ${method} from ${origin} (status ${result.status})`);
  }
  const denied = await preflight(disallowed, 'GET');
  if (denied.origin === disallowed || denied.origin === '*') throw new Error('R2 CORS rule allows an origin outside the browser test origins');
}

/**
 * Development-bucket storage for one qualification run. It never changes bucket settings and,
 * on close, removes only objects created after its own start-time snapshot.
 * Run one qualification per bucket at a time.
 */
export async function developmentR2Storage(origins: readonly string[], diagnostic?: FixtureDiagnostic) {
  const target = await developmentR2Configuration();
  await observeFixturePhase('r2.cors-preflight', () => verifyDevelopmentCors(target, origins), diagnostic);
  const client = new S3Client({ endpoint: target.endpoint, region: 'auto', forcePathStyle: true, credentials: target.credentials, maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const list = async () => {
    const keys = new Set<string>();
    for (const Prefix of prefixes) {
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: target.bucket, Prefix, ContinuationToken }), { abortSignal: AbortSignal.timeout(10000) });
        for (const item of page.Contents ?? []) if (item.Key) keys.add(item.Key);
        if (keys.size > 10000) throw new Error('R2 development bucket holds too many objects to snapshot safely');
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
    }
    return keys;
  };
  let before: Set<string>;
  try { before = await observeFixturePhase('r2.snapshot', list, diagnostic); }
  catch (error) { client.destroy(); throw error; }
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await observeFixturePhase('r2.cleanup', async () => {
        const created = [...await list()].filter(key => !before.has(key));
        for (const Key of created) await client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key }), { abortSignal: AbortSignal.timeout(10000) });
      }, diagnostic);
    } finally { client.destroy(); }
  };
  return Object.freeze({ endpoint: target.endpoint, bucket: target.bucket, region: 'auto', credentials: target.credentials, client, close });
}
