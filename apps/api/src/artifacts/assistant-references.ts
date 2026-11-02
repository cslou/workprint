import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { z } from 'zod';
import { idSchema, savedReferenceContentSchema, savedScriptContentSchema, scriptSubjects, useSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { parseContent } from './content.js';
import { ArtifactError } from './errors.js';
import { lockPublicationOwner, publishVersion } from './publication.js';
import { verifiedMedia } from './references.js';
import { createArtifactStore } from './store.js';
import { usedImageVersions } from './workspace-images.js';

type OwnedCheck = Parameters<typeof createArtifactStore>[1];
/** One view of a sheet: an exact image version and its view name. */
export type SheetViewInput = Readonly<{ versionId: string; view: string; notes: readonly string[] }>;
/**
 * A subject's sheet as the assistant saves it. The subject's id, kind and name come from the script; `baseVersionId`
 * is the subject's current sheet version the caller read, or null when it had none.
 */
export type AssistantSheetInput = Readonly<{ subjectId: string; description: string; continuityNotes: readonly string[]; views: readonly SheetViewInput[]; baseVersionId: string | null }>;
export type AssistantSheetSave = Readonly<{ version: Version; use: z.infer<typeof useSchema>; subjectName: string }>;

/** At most this many views in a sheet the assistant saves; a person's longer sheet stays valid but can't be revised by it. */
export const maxSheetViews = 5;
const maxUses = 100;
const binding = { purpose: 'reference' } as const;

/** Why a sheet can't be saved. `in_other_sheet` names the subject whose current sheet already holds an image. */
export class SheetSaveError extends Error {
  constructor(readonly reason: 'no_script' | 'not_in_script' | 'not_found' | 'stale' | 'invalid' | 'in_other_sheet' | 'no_room', readonly subjectName?: string) {
    super(`Sheet not saved: ${reason}`);
  }
}

type SheetRow = { use_id: string; version_id: string; version_owner_id: string; artifact_id: string; binding: unknown; content: unknown; dependencies: string[] };
type Sheet = SheetRow & { sheet: z.infer<typeof savedReferenceContentSchema> };

const trimmedLength = (value: string) => value.trim().length;

/** The video's current sheets in workspace order, each with its parsed content, locked for this save. */
async function currentSheets(client: PoolClient, account: string, conversation: string): Promise<Sheet[]> {
  const rows = (await client.query<SheetRow>(`SELECT u.use_id,u.version_id,u.version_owner_id,v.artifact_id,u.binding,v.content,
      COALESCE((SELECT array_agg(d.dependency_id ORDER BY d.position) FROM artifacts.version_dependencies d WHERE d.owner_id=v.owner_id AND d.version_id=v.version_id),ARRAY[]::text[]) AS dependencies
    FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='reference' AND v.kind='reference' ORDER BY u.created_at,u.use_id FOR UPDATE OF u`, [account, conversation])).rows;
  return rows.flatMap(row => { const sheet = savedReferenceContentSchema.safeParse(row.content); return sheet.success ? [{ ...row, sheet: sheet.data }] : []; });
}

async function useCount(client: Pool | PoolClient, account: string, conversation: string) {
  return (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2', [account, conversation])).rows[0]!.count;
}

/**
 * The assistant's sheet capability. It saves a script subject's sheet as a draft: the subject's first sheet as a new
 * reference, or the next version of its current sheet on the same use. It never overwrites a newer sheet, never
 * puts one image in two subjects' sheets, and never approves anything.
 */
export function createAssistantReferences(pool: Pool, checkOwnedConversation: OwnedCheck) {
  const reads = createArtifactStore(pool, checkOwnedConversation);
  const owned = async (account: string, conversation: string) => {
    if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new ArtifactError('invalid_input');
    const check = await checkOwnedConversation(account, conversation);
    if (check.kind !== 'owned') throw new ArtifactError(check.kind === 'not_found' ? 'not_found' : 'integration_failure');
  };
  return Object.freeze({
    /** How many more uses the video can hold, so a caller can refuse before any paid work. */
    async useRoom(account: string, conversation: string): Promise<number> {
      await owned(account, conversation);
      return Math.max(0, maxUses - await useCount(pool, account, conversation));
    },

    async save(account: string, conversation: string, input: AssistantSheetInput): Promise<AssistantSheetSave> {
      await owned(account, conversation);
      const ids = input.views.map(view => view.versionId);
      if (input.views.length < 1 || input.views.length > maxSheetViews || new Set(ids).size !== ids.length
        || input.views.some(view => trimmedLength(view.view) < 1 || trimmedLength(view.view) > 80)) throw new SheetSaveError('invalid');
      if (ids.some(id => !idSchema.safeParse(id).success)) throw new SheetSaveError('not_found');
      // Each view is an image this account can read, with its checked bytes stored, before anything is locked.
      for (const id of ids) {
        const version = await reads.version(account, id).catch((error: unknown) => { if (error instanceof ArtifactError && error.code === 'not_found') return null; throw error; });
        if (version?.kind !== 'image') throw new SheetSaveError('not_found');
      }
      if (!await verifiedMedia(pool, ids)) throw new SheetSaveError('invalid');
      const used = usedImageVersions(await reads.workspace(account, conversation));

      return transaction(pool, async client => {
        await lockPublicationOwner(client, account);
        const script = (await client.query<{ content: unknown }>(`SELECT v.content FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
          WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='script'`, [account, conversation])).rows[0];
        if (!script) throw new SheetSaveError('no_script');
        const subjects = scriptSubjects(savedScriptContentSchema.parse(script.content));
        const subject = subjects.find(candidate => candidate.id === input.subjectId);
        if (!subject) throw new SheetSaveError('not_in_script');
        const sheets = await currentSheets(client, account, conversation);
        const current = sheets.find(sheet => sheet.sheet.subject.id === subject.id);
        if ((current?.version_id ?? null) !== input.baseVersionId) throw new SheetSaveError('stale');
        if (current && current.sheet.references.length > maxSheetViews) throw new SheetSaveError('invalid');
        // A view is an image the video uses, or one the base sheet already holds, even if its own use moved on.
        const allowed = new Set([...used, ...(current?.dependencies ?? [])]);
        if (ids.some(id => !allowed.has(id))) throw new SheetSaveError('not_found');
        for (const other of sheets) {
          if (other === current || !other.sheet.references.some(reference => ids.includes(reference.versionId))) continue;
          const name = subjects.find(candidate => candidate.id === other.sheet.subject.id)?.name ?? other.sheet.subject.name;
          throw new SheetSaveError('in_other_sheet', name);
        }
        let content: ReturnType<typeof parseContent>;
        try {
          content = parseContent('reference', {
            schemaVersion: 1,
            subject: { id: subject.id, kind: subject.kind === 'place' ? 'environment' : subject.kind, name: subject.name, description: input.description, continuityNotes: [...input.continuityNotes] },
            references: input.views.map(view => ({ versionId: view.versionId, view: view.view.trim(), notes: [...view.notes] })),
          });
        } catch { throw new SheetSaveError('invalid'); }
        // A new sheet adds a use; a next version moves the sheet's own use.
        if (!current && await useCount(client, account, conversation) >= maxUses) throw new SheetSaveError('no_room');
        // The next version of the account's own sheet; a built-in sheet in use starts an owned one on the same use.
        const artifactId = current && current.version_owner_id === account ? current.artifact_id : undefined;
        const version = await publishVersion(client, { accountId: account, conversationId: conversation, artifactId, kind: 'reference', content, dependencies: ids, createdBy: 'assistant' });
        const useId = current?.use_id ?? randomUUID();
        if (current) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='draft' WHERE owner_id=$2 AND use_id=$3", [version.id, account, useId]);
        else await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'reference','draft')", [account, conversation, useId, version.id, binding]);
        return { version, use: useSchema.parse({ id: useId, versionId: version.id, binding: current?.binding ?? binding, state: 'draft' }), subjectName: subject.name };
      });
    },
  });
}
export type AssistantReferences = ReturnType<typeof createAssistantReferences>;
