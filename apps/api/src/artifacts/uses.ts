import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { idSchema, operations, useSchema, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { ArtifactError } from './errors.js';
import { canonicalJson } from './manual-content.js';
import { lockPublicationOwner } from './publication.js';
import { createArtifactStore } from './store.js';

type Command = OperationRequest<'useVersion'>['body'];
type Result = OperationResponse<'useVersion'>;
type Query = Pick<PoolClient, 'query'>;

/** Human exact-use capability. It publishes no version and grants no Shot choice. */
export function createVersionUses(pool: Pool, checkOwnedConversation: Parameters<typeof createArtifactStore>[1]) {
  const reads = createArtifactStore(pool, checkOwnedConversation);
  return Object.freeze({
    async useVersion(account: string, conversation: string, input: Command): Promise<Result> {
      const parsed = operations.useVersion.request.safeParse({ params: { id: conversation }, query: {}, body: input });
      if (!idSchema.safeParse(account).success || !parsed.success) throw new ArtifactError('invalid_input');
      const body = parsed.data.body;
      if (body.purpose !== 'script' && body.purpose !== 'reference' && body.purpose !== 'storyboard') throw new ArtifactError('invalid_input');
      const owned = await checkOwnedConversation(account, conversation);
      if (owned.kind !== 'owned') throw new ArtifactError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
      const { operationId, versionId, ...binding } = body;
      const scope = [account, conversation, 'use_version', operationId];
      const hash = createHash('sha256').update(canonicalJson(body)).digest('hex');
      const replay = async (client: Query): Promise<Result | undefined> => {
        const row = (await client.query<{ payload_hash: string; result: unknown }>('SELECT payload_hash,result FROM artifacts.commands WHERE owner_id=$1 AND conversation_id=$2 AND command_kind=$3 AND operation_id=$4', scope)).rows[0];
        if (!row) return undefined;
        if (row.payload_hash !== hash) throw new ArtifactError('invalid_input');
        const result = operations.useVersion.response.safeParse(row.result);
        if (!result.success || result.data.use.versionId !== versionId || result.data.use.state !== 'approved' || canonicalJson(result.data.use.binding) !== canonicalJson(binding)) throw new ArtifactError('integration_failure');
        return result.data;
      };
      const previous = await replay(pool);
      if (previous) return previous;
      // Native origin ownership and immutable version inspection stay outside SQL.
      const version = await reads.version(account, versionId);
      if (body.purpose === 'reference' ? !['reference', 'image', 'video'].includes(version.kind) : version.kind !== body.purpose) throw new ArtifactError('invalid_input');
      return transaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [canonicalJson(['artifact-command', ...scope])]);
        const retried = await replay(client);
        if (retried) return retried;
        await lockPublicationOwner(client, account);
        const matches = (await client.query<{ use_id: string }>(`SELECT u.use_id FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
          WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.binding=$3::jsonb AND ($4::boolean OR v.artifact_id=$5) LIMIT 2 FOR UPDATE OF u`, [account, conversation, binding, body.purpose !== 'reference', version.artifactId])).rows;
        if (matches.length > 1) throw new ArtifactError('invalid_input');
        const id = matches[0]?.use_id ?? randomUUID();
        if (matches.length) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='approved' WHERE owner_id=$2 AND use_id=$3", [version.id, account, id]);
        else {
          const count = (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2', [account, conversation])).rows[0]!.count;
          if (count >= 100) throw new ArtifactError('invalid_input');
          await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,$6,'approved')", [account, conversation, id, version.id, binding, body.purpose]);
        }
        const result = operations.useVersion.response.parse({ use: useSchema.parse({ id, versionId: version.id, binding, state: 'approved' }), selectionRevision: 0 });
        await client.query('INSERT INTO artifacts.commands(owner_id,conversation_id,command_kind,operation_id,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6)', [...scope, hash, result]);
        return result;
      });
    },
  });
}
