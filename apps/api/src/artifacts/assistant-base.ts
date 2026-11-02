import type { PoolClient } from 'pg';
import { idSchema, type Version } from '@workprint/contracts';
import { ArtifactError } from './errors.js';
import type { createArtifactStore } from './store.js';

type Reads = ReturnType<typeof createArtifactStore>;
/** The use an assistant save replaces, locked: its exact version, that version's owner and its artifact. */
export type CurrentUse = { use_id: string; version_id: string; version_owner_id: string; artifact_id: string };
/** The base the assistant named, read before the transaction; a lookup failure matters only when there is a current use. */
export type NamedBase = Readonly<{ base: Version | null; lookupFailure?: unknown }>;

/**
 * The version the assistant last read. Native ownership is checked outside SQL: a foreign, missing or malformed id
 * resolves to nothing, which is not found only when the video has work to protect. Any other lookup failure matters
 * only then too, since a first save ignores the base.
 */
export async function namedBase(reads: Reads, account: string, baseVersionId: string | null): Promise<NamedBase> {
  if (baseVersionId === null || !idSchema.safeParse(baseVersionId).success) return { base: null };
  let lookupFailure: unknown;
  const base = await reads.version(account, baseVersionId).catch((error: unknown) => { if (!(error instanceof ArtifactError && error.code === 'not_found')) lookupFailure = error; return null; });
  return lookupFailure === undefined ? { base } : { base, lookupFailure };
}

/** The video's use for `purpose`, locked for this save. */
export async function lockedUse(client: Pick<PoolClient, 'query'>, account: string, conversation: string, purpose: 'script' | 'storyboard'): Promise<CurrentUse | undefined> {
  return (await client.query<CurrentUse>(`SELECT u.use_id,u.version_id,u.version_owner_id,v.artifact_id
    FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose=$3 FOR UPDATE OF u`, [account, conversation, purpose])).rows[0];
}

/**
 * A save on any base but the current version never overwrites newer work: an earlier version of the current artifact
 * is stale, an empty base is stale, and any other version is not found. With no current use there is nothing to protect.
 */
export function assertBase(current: CurrentUse | undefined, baseVersionId: string | null, named: NamedBase, kind: 'script' | 'storyboard'): void {
  if (!current) return;
  if (baseVersionId === null) throw new ArtifactError('stale_revision');
  if (named.lookupFailure !== undefined) throw named.lookupFailure;
  if (!named.base || named.base.kind !== kind || current.artifact_id !== named.base.artifactId) throw new ArtifactError('not_found');
  if (current.version_id !== named.base.id) throw new ArtifactError('stale_revision');
}
