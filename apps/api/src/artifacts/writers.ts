import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { idSchema, operations, useSchema, type OperationRequest, type OperationResponse, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { parseContent, assertContentDependencies } from './content.js';
import { ArtifactError } from './errors.js';
import { assertManualTextChange, canonicalJson } from './manual-content.js';
import { publishVersion } from './publication.js';
import { createArtifactStore } from './store.js';

type Command = OperationRequest<'saveVersion'>['body'];
type Result = OperationResponse<'saveVersion'>;
type OwnedCheck = Parameters<typeof createArtifactStore>[1];
export type ArtifactSaveWriter = Readonly<{ save(account: string, conversation: string, input: Command): Promise<Result> }>;
type Query = Pick<PoolClient, 'query'>;

/** Composition receives separate capabilities; assistant bindings receive only assistant.
 * Producer and decision authority are closure-owned, never accepted in a payload.
 * No agent tool is registered by creating these in-process services.
 */
export function createArtifactWriters(pool: Pool, checkOwnedConversation: OwnedCheck): Readonly<{ human: ArtifactSaveWriter; assistant: ArtifactSaveWriter }> {
  const reads = createArtifactStore(pool, checkOwnedConversation);
  const capability = (producer: 'human' | 'assistant'): ArtifactSaveWriter => ({
    async save(account, conversation, input) {
      const parsed = operations.saveVersion.request.safeParse({ params: { id: conversation }, query: {}, body: input });
      if (!idSchema.safeParse(account).success || !parsed.success) throw new ArtifactError('invalid_input');
      const body = parsed.data.body;
      if (!body.artifactId || !body.baseVersionId || body.dependencies.length > 100 || new Set(body.dependencies).size !== body.dependencies.length || (producer === 'assistant' && body.intendedUse)) throw new ArtifactError('invalid_input');
      const admission = await checkOwnedConversation(account, conversation);
      if (admission.kind !== 'owned') throw new ArtifactError(admission.kind === 'not_found' ? 'not_found' : 'integration_failure');
      let content: ReturnType<typeof parseContent>;
      try { content = parseContent(body.kind, body.content); } catch { throw new ArtifactError('invalid_input'); }
      if (body.intendedUse && body.intendedUse.purpose !== body.kind) throw new ArtifactError('invalid_input');
      const kind = producer === 'human' ? 'manual_save' : 'assistant_draft';
      const scope = [account, conversation, kind, body.operationId];
      const hash = createHash('sha256').update(canonicalJson({ ...body, content })).digest('hex');
      const replay = async (client: Query): Promise<Result | undefined> => {
        const row = (await client.query<{ payload_hash: string; result: unknown }>('SELECT payload_hash,result FROM artifacts.commands WHERE owner_id=$1 AND conversation_id=$2 AND command_kind=$3 AND operation_id=$4', scope)).rows[0];
        if (!row) return undefined;
        if (row.payload_hash !== hash) throw new ArtifactError('invalid_input');
        const result = operations.saveVersion.response.safeParse(row.result);
        if (!result.success) throw new ArtifactError('integration_failure');
        return result.data;
      };
      const previous = await replay(pool);
      if (previous) return previous;

      // All native authorization is completed before acquiring any SQL transaction.
      const base = await reads.version(account, body.baseVersionId);
      if (base.artifactId !== body.artifactId || base.kind !== body.kind) throw new ArtifactError('not_found');
      const dependencies = new Map<string, Version>();
      for (const id of body.dependencies) dependencies.set(id, await reads.version(account, id));
      assertContentDependencies(content, dependencies);
      if (producer === 'human') assertManualTextChange(base, content, body.dependencies);
      let intended: { use_id: string; version_id: string } | undefined;
      if (body.intendedUse) {
        const matches = (await pool.query<{ use_id: string; version_id: string }>(`SELECT u.use_id,u.version_id FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.owner_id AND v.version_id=u.version_id
          WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.binding=$3::jsonb AND v.artifact_id=$4 LIMIT 2`, [account, conversation, body.intendedUse, body.artifactId])).rows;
        if (matches.length > 1) throw new ArtifactError('invalid_input');
        intended = matches[0];
        if (!intended) throw new ArtifactError('not_found');
        const used = await reads.version(account, intended.version_id);
        // Promoting a structural planning draft would bypass later selection-revision rules.
        if (body.kind === 'storyboard') assertManualTextChange(used, content, body.dependencies);
      }

      return transaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [canonicalJson(['artifact-command', ...scope])]);
        const retried = await replay(client);
        if (retried) return retried;
        const version = await publishVersion(client, { accountId: account, conversationId: conversation, artifactId: body.artifactId!, baseVersionId: body.baseVersionId!, kind: body.kind, content, dependencies: body.dependencies, createdBy: producer });
        let use: Result['use'];
        let previousUseVersion: string | null = null;
        if (body.intendedUse) {
          // Save only moves the exact existing use of this artifact, not a new association.
          const matches = (await client.query<{ use_id: string; version_id: string }>(`SELECT u.use_id,u.version_id FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.owner_id AND v.version_id=u.version_id
            WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.binding=$3::jsonb AND v.artifact_id=$4 LIMIT 2 FOR UPDATE OF u`, [account, conversation, body.intendedUse, body.artifactId])).rows;
          if (matches.length > 1) throw new ArtifactError('invalid_input');
          const current = matches[0];
          if (!current) throw new ArtifactError('not_found');
          if (current.use_id !== intended?.use_id || current.version_id !== intended.version_id) throw new ArtifactError('stale_revision');
          previousUseVersion = current.version_id;
          await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='approved' WHERE owner_id=$2 AND use_id=$3", [version.id, account, current.use_id]);
          use = useSchema.parse({ id: current.use_id, versionId: version.id, binding: body.intendedUse, state: 'approved' });
        }
        const result: Result = { version, ...(use ? { use } : {}) };
        await client.query('INSERT INTO artifacts.commands(owner_id,conversation_id,command_kind,operation_id,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6)', [...scope, hash, result]);
        if (producer === 'human') await client.query('INSERT INTO artifacts.manual_changes(owner_id,change_id,conversation_id,operation_id,previous_version_id,version_id,use_id,previous_use_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [account, randomUUID(), conversation, body.operationId, base.id, version.id, use?.id ?? null, previousUseVersion]);
        return result;
      });
    },
  });
  return Object.freeze({ human: Object.freeze(capability('human')), assistant: Object.freeze(capability('assistant')) });
}
