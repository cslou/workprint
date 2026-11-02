import type { Pool } from 'pg';

/** A media version's stored object, protected for that exact version. */
export type MediaObject = Readonly<{ ownerId: string; versionId: string; objectKey: string; posterKey: string | null; sha256: string }>;

/**
 * Media rows whose object is protected for that exact version, from either source: an upload object or
 * an assistant-made (generated) object. A poster, when there is one, must be protected too.
 */
const protectedMedia = `SELECT m.owner_id,m.version_id,COALESCE(o.object_key,g.object_key) AS object_key,m.poster_key,m.sha256 FROM artifacts.media_objects m
  LEFT JOIN artifacts.upload_objects o ON o.owner_id=m.owner_id AND o.object_key=m.object_key AND o.protected_version_id=m.version_id
  LEFT JOIN artifacts.generated_objects g ON g.owner_id=m.owner_id AND g.object_key=m.generated_key AND g.version_id=m.version_id
  LEFT JOIN artifacts.upload_objects p ON p.owner_id=m.owner_id AND p.object_key=m.poster_key AND p.protected_version_id=m.version_id
  WHERE (o.object_key IS NOT NULL OR g.object_key IS NOT NULL) AND (m.poster_key IS NULL OR p.object_key IS NOT NULL)`;

/** Protected media objects for these exact versions; `owner` narrows them to one owner. Missing ones are left out. */
export async function protectedMediaObjects(pool: Pool, versionIds: readonly string[], owner?: string): Promise<MediaObject[]> {
  const rows = (await pool.query<{ owner_id: string; version_id: string; object_key: string; poster_key: string | null; sha256: string }>(
    `${protectedMedia} AND m.version_id=ANY($1::text[]) AND ($2::text IS NULL OR m.owner_id=$2)`, [versionIds, owner ?? null])).rows;
  return rows.map(row => ({ ownerId: row.owner_id, versionId: row.version_id, objectKey: row.object_key, posterKey: row.poster_key, sha256: row.sha256 }));
}
