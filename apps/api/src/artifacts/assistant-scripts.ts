import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { z } from 'zod';
import { idSchema, savedScriptContentSchema, scriptBodySchema, useSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { parseContent } from './content.js';
import { ArtifactError } from './errors.js';
import { lockPublicationOwner, publishVersion } from './publication.js';
import { withSubjects, type SubjectInput } from './script-subjects.js';
import { createArtifactStore } from './store.js';

type OwnedCheck = Parameters<typeof createArtifactStore>[1];
/** `content` is the script without its subjects; `subjects` is the full new list, or empty to keep the base's. */
export type AssistantScriptInput = Readonly<{ content: unknown; baseVersionId: string | null; subjects?: readonly SubjectInput[] }>;
export type AssistantScriptSave = Readonly<{ version: Version; use: z.infer<typeof useSchema> }>;
const binding = { purpose: 'script' } as const;

/**
 * The assistant's script capability. It saves the video's next script version and makes it the current script.
 * The use is always a draft: an assistant save never approves anything.
 * The base is the exact version the assistant last read. A save on any other base never overwrites newer work:
 * an earlier version of the current script is stale, and any other version is not found. A video with no script
 * has nothing to overwrite, so its first save ignores the base (models do not reliably send null).
 * The subjects' ids are resolved against the base inside the owner lock (see `withSubjects`).
 */
export function createAssistantScripts(pool: Pool, checkOwnedConversation: OwnedCheck) {
  const reads = createArtifactStore(pool, checkOwnedConversation);
  return Object.freeze({
    async save(account: string, conversation: string, input: AssistantScriptInput): Promise<AssistantScriptSave> {
      if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new ArtifactError('invalid_input');
      const owned = await checkOwnedConversation(account, conversation);
      if (owned.kind !== 'owned') throw new ArtifactError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
      const body = scriptBodySchema.safeParse(input.content);
      if (!body.success) throw new ArtifactError('invalid_input');
      // Native ownership of the base is checked outside SQL. A foreign, missing or malformed id resolves to
      // nothing, which is not found only when the video has a script to protect. Any other lookup failure
      // matters only then too: a first save ignores the base.
      let lookupFailure: unknown;
      const base = input.baseVersionId === null || !idSchema.safeParse(input.baseVersionId).success ? null
        : await reads.version(account, input.baseVersionId).catch((error: unknown) => { if (!(error instanceof ArtifactError && error.code === 'not_found')) lookupFailure = error; return null; });

      return transaction(pool, async client => {
        // The owner lock serializes this account's publishers, so two first saves cannot both create a script.
        await lockPublicationOwner(client, account);
        const current = (await client.query<{ use_id: string; version_id: string; version_owner_id: string; artifact_id: string }>(`SELECT u.use_id,u.version_id,u.version_owner_id,v.artifact_id
          FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
          WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='script' FOR UPDATE OF u`, [account, conversation])).rows[0];
        if (current) {
          if (input.baseVersionId === null) throw new ArtifactError('stale_revision');
          if (lookupFailure) throw lookupFailure;
          if (!base || base.kind !== 'script' || current.artifact_id !== base.artifactId) throw new ArtifactError('not_found');
          if (current.version_id !== base.id) throw new ArtifactError('stale_revision');
        }
        const baseContent = current && base && 'content' in base ? savedScriptContentSchema.parse(base.content) : null;
        let content: ReturnType<typeof parseContent>;
        const next = withSubjects(body.data, baseContent, input.subjects ?? []);
        try { content = parseContent('script', next); } catch { throw new ArtifactError('invalid_input'); }
        // The next revision of the account's own script; a built-in script in use starts a new owned one.
        const artifactId = current && current.version_owner_id === account ? current.artifact_id : undefined;
        const version = await publishVersion(client, { accountId: account, conversationId: conversation, artifactId, kind: 'script', content, dependencies: [], createdBy: 'assistant' });
        const useId = current?.use_id ?? randomUUID();
        if (current) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='draft' WHERE owner_id=$2 AND use_id=$3", [version.id, account, useId]);
        else {
          const count = (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2', [account, conversation])).rows[0]!.count;
          // The video's use limit is not the script's fault: report it as unavailable, not invalid.
          if (count >= 100) throw new ArtifactError('integration_failure');
          await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'script','draft')", [account, conversation, useId, version.id, binding]);
        }
        return { version, use: useSchema.parse({ id: useId, versionId: version.id, binding, state: 'draft' }) };
      });
    },
  });
}
export type AssistantScripts = ReturnType<typeof createAssistantScripts>;
