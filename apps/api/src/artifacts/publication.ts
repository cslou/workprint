import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { versionSchema, type Version } from '@workprint/contracts';
import type { parseContent } from './content.js';
import { ArtifactError } from './errors.js';

type Publication = {
  accountId: string; conversationId: string; artifactId?: string | undefined;
  dependencies: readonly string[]; baseVersionId?: string | undefined;
} & ({ kind: 'script' | 'reference' | 'storyboard'; content: ReturnType<typeof parseContent>; createdBy: 'human' | 'assistant' }
  | { kind: 'image' | 'video'; media: Extract<Version, { kind: 'image' | 'video' }>['media']; createdBy: 'human' });
/** Transaction-local SQL shared by controlled prerequisites and command writers. No external collaborators. */
export async function publishVersion(client: PoolClient, input: Publication): Promise<Version> {
  const artifact = input.artifactId ?? randomUUID();
  const publication = (await client.query<{ revision: string }>('INSERT INTO artifacts.publication_counters(owner_id,revision) VALUES($1,1) ON CONFLICT(owner_id) DO UPDATE SET revision=publication_counters.revision+1 RETURNING revision::text', [input.accountId])).rows[0]!.revision;
  if (!input.artifactId) await client.query('INSERT INTO artifacts.artifacts(owner_id,artifact_id,kind) VALUES($1,$2,$3)', [input.accountId, artifact, input.kind]);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([input.accountId, artifact])]);
  const locked = await client.query<{ kind: string }>('SELECT kind FROM artifacts.artifacts WHERE owner_id=$1 AND artifact_id=$2', [input.accountId, artifact]);
  if (!locked.rows[0]) throw new ArtifactError('not_found');
  if (locked.rows[0].kind !== input.kind) throw new ArtifactError('invalid_input');
  const latest = (await client.query<{ version_id: string; revision: number }>('SELECT version_id,revision FROM artifacts.versions WHERE owner_id=$1 AND artifact_id=$2 ORDER BY revision DESC LIMIT 1', [input.accountId, artifact])).rows[0];
  if (input.baseVersionId && latest?.version_id !== input.baseVersionId) throw new ArtifactError('stale_revision');
  const id = randomUUID(), revision = (latest?.revision ?? 0) + 1;
  const data = 'media' in input ? { media: input.media } : { content: input.content };
  const stored = 'media' in input ? { schemaVersion: 1, media: input.media } : input.content;
  const row = (await client.query<{ created_at: Date }>(`INSERT INTO artifacts.versions(owner_id,version_id,artifact_id,kind,revision,schema_version,content,origin_conversation_id,created_by,provenance,publication_revision)
    VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10) RETURNING created_at`, [input.accountId, id, artifact, input.kind, revision, stored, input.conversationId, input.createdBy, 'media' in input ? 'upload' : input.createdBy === 'assistant' ? 'assistant' : 'manual', publication])).rows[0]!;
  for (const [position, dependency] of input.dependencies.entries()) await client.query('INSERT INTO artifacts.version_dependencies(owner_id,version_id,dependency_id,position) VALUES($1,$2,$3,$4)', [input.accountId, id, dependency, position]);
  return versionSchema.parse({ id, artifactId: artifact, kind: input.kind, revision, ...data, dependencies: [...input.dependencies], createdBy: input.createdBy, createdAt: row.created_at.toISOString() });
}
