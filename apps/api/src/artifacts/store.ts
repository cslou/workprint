import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { idSchema, operations, savedStoryboardContentSchema, useBindingSchema, useSchema, versionSchema, type OperationResponse, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { parseContent } from './content.js';
import { createCursors } from './cursor.js';
import { ArtifactError } from './errors.js';

type OwnershipCheck = (account: string, conversation: string) => Promise<{ kind: 'owned' | 'not_found' } | { kind: 'unavailable'; reason: 'native_storage' }>;
type Kind = 'script' | 'reference' | 'storyboard';
type Row = { owner_id: string; version_id: string; artifact_id: string; kind: Kind; revision: number; content: unknown; created_by: 'human' | 'assistant'; created_at: Date; origin_conversation_id: string; dependencies: string[]; sort_time: string };
const columns = `v.*,to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sort_time,
  COALESCE((SELECT array_agg(d.dependency_id ORDER BY d.position) FROM artifacts.version_dependencies d WHERE d.owner_id=v.owner_id AND d.version_id=v.version_id),ARRAY[]::text[]) AS dependencies`;
const historyCursor = z.strictObject({ max: z.number().int().positive(), after: z.number().int().positive() });
const libraryCursor = z.strictObject({ at: z.iso.datetime(), afterTime: z.iso.datetime(), afterId: idSchema });
const insertSchema = z.strictObject({
  accountId: idSchema, conversationId: idSchema, artifactId: idSchema.optional(), kind: z.enum(['script', 'reference', 'storyboard']),
  content: z.unknown(), dependencies: z.array(idSchema).max(100).refine(ids => new Set(ids).size === ids.length), createdBy: z.enum(['human', 'assistant']),
  use: z.strictObject({ binding: useBindingSchema, state: z.enum(['draft', 'approved']) }).optional(),
});
export type InsertVersion = z.infer<typeof insertSchema>;

/** Narrow in-process persistence and reads. No HTTP seed/save route or producer is registered. */
export function createArtifactStore(pool: Pool, checkOwnedConversation: OwnershipCheck) {
  const cursors = createCursors();
  const owned = async (account: string, conversation: string) => {
    const result = await checkOwnedConversation(account, conversation);
    if (result.kind !== 'owned') throw new ArtifactError(result.kind === 'not_found' ? 'not_found' : 'integration_failure');
  };
  const authorize = async (account: string, rows: readonly Row[]) => {
    for (const conversation of new Set(rows.map(row => row.origin_conversation_id))) await owned(account, conversation);
  };
  const project = (row: Row): Version => {
    try {
      return versionSchema.parse({ id: row.version_id, artifactId: row.artifact_id, kind: row.kind, revision: row.revision,
        content: parseContent(row.kind, row.content), createdBy: row.created_by, createdAt: row.created_at.toISOString(), dependencies: row.dependencies });
    } catch { throw new ArtifactError('integration_failure'); }
  };
  const rowFor = async (account: string, id: string) => {
    const result = await pool.query<Row>(`SELECT ${columns} FROM artifacts.versions v WHERE v.owner_id=$1 AND v.version_id=$2`, [account, id]);
    const row = result.rows[0];
    if (!row) throw new ArtifactError('not_found');
    await owned(account, row.origin_conversation_id);
    return row;
  };
  const version = async (account: string, id: string) => project(await rowFor(account, id));
  const history = async (account: string, artifact: string, query: { cursor?: string; limit?: number } = {}): Promise<OperationResponse<'artifactVersions'>> => {
    const parsed = operations.artifactVersions.request.safeParse({ params: { id: artifact }, query, body: {} });
    if (!parsed.success) throw new ArtifactError('invalid_input');
    const limit = query.limit ?? 20;
    const scope = JSON.stringify([account, 'history', artifact, limit]);
    const latest = await pool.query<Row>(`SELECT ${columns} FROM artifacts.versions v WHERE v.owner_id=$1 AND v.artifact_id=$2 ORDER BY v.revision DESC LIMIT 1`, [account, artifact]);
    if (!latest.rows[0]) throw new ArtifactError('not_found');
    await authorize(account, latest.rows);
    const cursor = query.cursor ? historyCursor.safeParse(cursors.decode(scope, query.cursor)) : null;
    if (cursor && !cursor.success) throw new ArtifactError('invalid_input');
    const max = cursor?.data?.max ?? latest.rows[0].revision;
    const after = cursor?.data?.after ?? max + 1;
    const rows = (await pool.query<Row>(`SELECT ${columns} FROM artifacts.versions v WHERE v.owner_id=$1 AND v.artifact_id=$2 AND v.revision<=$3 AND v.revision<$4 ORDER BY v.revision DESC LIMIT $5`, [account, artifact, max, after, limit + 1])).rows;
    await authorize(account, rows);
    const visible = rows.slice(0, limit);
    return { items: visible.map(project), nextCursor: rows.length > limit ? cursors.encode(scope, { max, after: visible.at(-1)!.revision }) : null };
  };
  const library = async (account: string, query: { cursor?: string; limit?: number; kind?: string } = {}): Promise<OperationResponse<'library'>> => {
    const parsed = operations.library.request.safeParse({ params: {}, query, body: {} });
    if (!parsed.success) throw new ArtifactError('invalid_input');
    const limit = query.limit ?? 20;
    const scope = JSON.stringify([account, 'library', query.kind ?? null, limit]);
    const cursor = query.cursor ? libraryCursor.safeParse(cursors.decode(scope, query.cursor)) : null;
    if (cursor && !cursor.success) throw new ArtifactError('invalid_input');
    const at = cursor?.data?.at ?? (await pool.query<{ at: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`)).rows[0]!.at;
    const rows = (await pool.query<Row>(`WITH latest AS (
      SELECT DISTINCT ON (v.artifact_id) ${columns} FROM artifacts.versions v
      WHERE v.owner_id=$1 AND v.created_at<=$2::timestamptz AND ($3::text IS NULL OR v.kind=$3)
      ORDER BY v.artifact_id,v.revision DESC
    ) SELECT * FROM latest WHERE ($4::timestamptz IS NULL OR (created_at,version_id)<($4::timestamptz,$5::text))
      ORDER BY created_at DESC,version_id DESC LIMIT $6`, [account, at, query.kind ?? null, cursor?.data?.afterTime ?? null, cursor?.data?.afterId ?? null, limit + 1])).rows;
    await authorize(account, rows);
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return { items: visible.map(row => ({ id: row.artifact_id, kind: row.kind, builtIn: false, latestVersion: project(row) })),
      nextCursor: rows.length > limit && last ? cursors.encode(scope, { at, afterTime: last.sort_time, afterId: last.version_id }) : null };
  };
  const workspace = async (account: string, conversation: string): Promise<OperationResponse<'workspace'>> => {
    await owned(account, conversation);
    const rows = (await pool.query<Row & { use_id: string; binding: unknown; state: string }>(`SELECT ${columns},u.use_id,u.binding,u.state
      FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.owner_id AND v.version_id=u.version_id
      WHERE u.owner_id=$1 AND u.conversation_id=$2 ORDER BY u.created_at,u.use_id LIMIT 101`, [account, conversation])).rows;
    if (rows.length > 100) throw new ArtifactError('integration_failure');
    await authorize(account, rows);
    const work = rows.map(row => {
      const use = useSchema.safeParse({ id: row.use_id, versionId: row.version_id, binding: row.binding, state: row.state });
      if (!use.success) throw new ArtifactError('integration_failure');
      return { version: project(row), use: use.data, state: use.data.state === 'approved' ? 'Ready' as const : 'Draft' as const };
    });
    const script = work.find(item => item.use.binding.purpose === 'script') ?? null;
    const board = work.find(item => item.use.binding.purpose === 'storyboard') ?? null;
    const planning = board && board.version.kind === 'storyboard' ? savedStoryboardContentSchema.parse(board.version.content) : null;
    return { script, assets: work.filter(item => item.use.binding.purpose === 'reference'),
      storyboard: { work: board, shots: planning?.shots.map(shot => ({ ...shot, panels: shot.panels.map(panel => ({ ...panel, candidateImageVersions: [], approvedImageVersionId: null })), chosenVideoVersionId: null })) ?? [] },
      videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 0 };
  };
  const insert = async (input: InsertVersion): Promise<Version> => {
    const parsed = insertSchema.safeParse(input);
    if (!parsed.success) throw new ArtifactError('invalid_input');
    await owned(input.accountId, input.conversationId);
    let content: ReturnType<typeof parseContent>;
    try { content = parseContent(input.kind, input.content); } catch { throw new ArtifactError('invalid_input'); }
    if (input.use && (input.use.binding.purpose !== input.kind || (input.createdBy === 'assistant' && input.use.state === 'approved'))) throw new ArtifactError('invalid_input');
    const dependencies = new Map<string, Row>();
    for (const id of input.dependencies) dependencies.set(id, await rowFor(input.accountId, id));
    const referenced = 'sourceScriptVersionId' in content ? [content.sourceScriptVersionId, ...content.shots.flatMap(shot => shot.panels.flatMap(panel => panel.references))]
      : 'references' in content ? content.references.map(reference => reference.versionId) : [];
    if (referenced.some(id => !dependencies.has(id))) throw new ArtifactError('invalid_input');
    if ('sourceScriptVersionId' in content && dependencies.get(content.sourceScriptVersionId)?.kind !== 'script') throw new ArtifactError('invalid_input');
    // Media references cannot be published by this text-only boundary.
    if ('subject' in content && content.references.length > 0) throw new ArtifactError('invalid_input');
    if (input.artifactId) {
      const latest = (await pool.query<Row>(`SELECT ${columns} FROM artifacts.versions v WHERE v.owner_id=$1 AND v.artifact_id=$2 ORDER BY v.revision DESC LIMIT 1`, [input.accountId, input.artifactId])).rows[0];
      if (!latest) throw new ArtifactError('not_found');
      await authorize(input.accountId, [latest]);
    }
    const artifact = input.artifactId ?? randomUUID();
    const id = randomUUID();
    await transaction(pool, async client => {
      if (!input.artifactId) await client.query('INSERT INTO artifacts.artifacts(owner_id,artifact_id,kind) VALUES($1,$2,$3)', [input.accountId, artifact, input.kind]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([input.accountId, artifact])]);
      const locked = await client.query<{ kind: string }>('SELECT kind FROM artifacts.artifacts WHERE owner_id=$1 AND artifact_id=$2', [input.accountId, artifact]);
      if (locked.rows[0]?.kind !== input.kind) throw new ArtifactError('invalid_input');
      const revision = (await client.query<{ revision: number }>('SELECT COALESCE(max(revision),0)+1 AS revision FROM artifacts.versions WHERE owner_id=$1 AND artifact_id=$2', [input.accountId, artifact])).rows[0]!.revision;
      await client.query(`INSERT INTO artifacts.versions(owner_id,version_id,artifact_id,kind,revision,schema_version,content,origin_conversation_id,created_by,provenance)
        VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9)`, [input.accountId, id, artifact, input.kind, revision, content, input.conversationId, input.createdBy, input.createdBy === 'assistant' ? 'assistant' : 'manual']);
      for (const [position, dependency] of input.dependencies.entries()) await client.query('INSERT INTO artifacts.version_dependencies(owner_id,version_id,dependency_id,position) VALUES($1,$2,$3,$4)', [input.accountId, id, dependency, position]);
      if (input.use) await client.query('INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,$6,$7)', [input.accountId, input.conversationId, randomUUID(), id, input.use.binding, input.use.binding.purpose, input.use.state]);
    });
    return version(input.accountId, id);
  };
  return { version, history, library, workspace, insert };
}
export type ArtifactStore = ReturnType<typeof createArtifactStore>;
