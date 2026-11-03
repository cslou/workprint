import type { Pool } from 'pg';
import type { z } from 'zod';
import { idSchema, savedScriptContentSchema, scriptBodySchema, useSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { parseContent } from './content.js';
import { ArtifactError } from './errors.js';
import { assertBase, lockedUse, namedBase, publishDraftUse } from './assistant-base.js';
import { lockPublicationOwner } from './publication.js';
import { withSubjects, type SubjectInput } from './script-subjects.js';
import { createArtifactStore } from './store.js';
import { useRoom } from './use-room.js';

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
      const named = await namedBase(reads, account, input.baseVersionId);

      return transaction(pool, async client => {
        // The owner lock serializes this account's publishers, so two first saves cannot both create a script.
        await lockPublicationOwner(client, account);
        const current = await lockedUse(client, account, conversation, 'script');
        assertBase(current, input.baseVersionId, named, 'script');
        const base = named.base;
        const baseContent = current && base && 'content' in base ? savedScriptContentSchema.parse(base.content) : null;
        let content: ReturnType<typeof parseContent>;
        const next = withSubjects(body.data, baseContent, input.subjects ?? []);
        try { content = parseContent('script', next); } catch { throw new ArtifactError('invalid_input'); }
        // The video's use limit is not the script's fault: report it as unavailable, not invalid.
        if (!current && await useRoom(client, account, conversation) === 0) throw new ArtifactError('integration_failure');
        const { version, useId } = await publishDraftUse(client, account, conversation, current, { kind: 'script', content, dependencies: [], purpose: 'script', binding });
        return { version, use: useSchema.parse({ id: useId, versionId: version.id, binding, state: 'draft' }) };
      });
    },
  });
}
export type AssistantScripts = ReturnType<typeof createAssistantScripts>;
