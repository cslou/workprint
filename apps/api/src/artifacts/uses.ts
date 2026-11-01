import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { idSchema, operations, savedStoryboardContentSchema, useSchema, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { ArtifactError } from './errors.js';
import { canonicalJson } from './manual-content.js';
import { lockPublicationOwner } from './publication.js';
import { advanceSelectionRevision, affectedVersions, changedShots, selectionRevision, shotOrderChanged, upstreamAffected } from './selection.js';
import { createArtifactStore } from './store.js';

type Command = OperationRequest<'useVersion'>['body'];
type Result = OperationResponse<'useVersion'>;
type Query = Pick<PoolClient, 'query'>;

const plan = (content: unknown) => savedStoryboardContentSchema.safeParse(content).data ?? null;
/** The conversation's used Storyboard, locked against concurrent replacement while a decision binds to it. */
async function usedPlan(client: Query, account: string, conversation: string, lock: boolean) {
  return (await client.query<{ version_id: string; version_owner_id: string; content: unknown }>(`SELECT u.version_id,u.version_owner_id,v.content FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='storyboard'${lock ? ' FOR SHARE OF u' : ''}`, [account, conversation])).rows[0];
}

/** Human exact-use capability. It publishes no version and grants no Shot choice. */
export function createVersionUses(pool: Pool, checkOwnedConversation: Parameters<typeof createArtifactStore>[1]) {
  const reads = createArtifactStore(pool, checkOwnedConversation);
  return Object.freeze({
    async useVersion(account: string, conversation: string, input: Command): Promise<Result> {
      const parsed = operations.useVersion.request.safeParse({ params: { id: conversation }, query: {}, body: input });
      if (!idSchema.safeParse(account).success || !parsed.success) throw new ArtifactError('invalid_input');
      const body = parsed.data.body;
      if (body.purpose === 'shot_video') throw new ArtifactError('invalid_input');
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
      if (body.purpose === 'reference' ? !['reference', 'image', 'video'].includes(version.kind) : version.kind !== (body.purpose === 'panel_image' ? 'image' : body.purpose)) throw new ArtifactError('invalid_input');
      // A Panel image binds only to an existing Panel of the Storyboard this conversation uses.
      const target = body.purpose === 'panel_image' ? await usedPlan(pool, account, conversation, false) : undefined;
      if (body.purpose === 'panel_image' && !plan(target?.content)?.shots.some(shot => shot.shotId === body.shotId && shot.panels.some(panel => panel.panelId === body.panelId))) throw new ArtifactError('invalid_input');
      return transaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [canonicalJson(['artifact-command', ...scope])]);
        const retried = await replay(client);
        if (retried) return retried;
        await lockPublicationOwner(client, account);
        const board = await usedPlan(client, account, conversation, true);
        if (body.purpose === 'panel_image' && board?.version_id !== target?.version_id) throw new ArtifactError('stale_revision');
        const insert = async (use: string) => {
          const count = (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2', [account, conversation])).rows[0]!.count;
          if (count >= 100) throw new ArtifactError('invalid_input');
          await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,$6,'approved')", [account, conversation, use, version.id, binding, body.purpose]);
        };
        let id: string, previous: { version_id: string; version_owner_id: string } | undefined;
        if (body.purpose === 'panel_image') {
          // Candidates stay as drafts; approving one replaces only the Panel's earlier approved image.
          const bound = (await client.query<{ use_id: string; version_id: string; version_owner_id: string; state: string }>('SELECT use_id,version_id,version_owner_id,state FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2 AND binding=$3::jsonb ORDER BY use_id FOR UPDATE', [account, conversation, binding])).rows;
          for (const row of bound) if (row.state === 'approved' && row.version_id !== version.id) await client.query("UPDATE artifacts.conversation_uses SET state='draft' WHERE owner_id=$1 AND use_id=$2", [account, row.use_id]);
          previous = bound.find(row => row.state === 'approved');
          const existing = bound.find(row => row.version_id === version.id);
          id = existing?.use_id ?? randomUUID();
          if (existing) await client.query("UPDATE artifacts.conversation_uses SET state='approved' WHERE owner_id=$1 AND use_id=$2", [account, id]);
          else await insert(id);
        } else {
          const matches = (await client.query<{ use_id: string; version_id: string; version_owner_id: string }>(`SELECT u.use_id,u.version_id,u.version_owner_id FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
            WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.binding=$3::jsonb AND ($4::boolean OR v.artifact_id=$5) LIMIT 2 FOR UPDATE OF u`, [account, conversation, binding, body.purpose !== 'reference', version.artifactId])).rows;
          if (matches.length > 1) throw new ArtifactError('invalid_input');
          id = matches[0]?.use_id ?? randomUUID(); previous = matches[0];
          if (matches.length) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='approved' WHERE owner_id=$2 AND use_id=$3", [version.id, account, id]);
          else await insert(id);
        }
        // Using a Storyboard with a different Shot order is a Shot-order change.
        const reordered = body.purpose === 'storyboard' && 'content' in version && shotOrderChanged(plan(board?.content), plan(version.content));
        const revision = reordered ? await advanceSelectionRevision(client, account, conversation) : await selectionRevision(client, account, conversation);
        const result = operations.useVersion.response.parse({ use: useSchema.parse({ id, versionId: version.id, binding, state: 'approved' }), selectionRevision: revision });
        await client.query('INSERT INTO artifacts.commands(owner_id,conversation_id,command_kind,operation_id,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6)', [...scope, hash, result]);
        // Journal the exact decision it replaced and the downstream work that now needs revalidation.
        const replaced = previous && previous.version_id !== version.id ? previous : undefined;
        const affected = !replaced ? [] : body.purpose === 'storyboard' ? await affectedVersions(client, account, conversation, changedShots(plan(board?.content), plan('content' in version ? version.content : null)))
          : body.purpose === 'panel_image' ? [] : await upstreamAffected(client, account, conversation, replaced.version_id);
        await client.query(`INSERT INTO artifacts.use_changes(owner_id,change_id,conversation_id,operation_id,use_id,previous_version_owner_id,previous_version_id,version_owner_id,version_id,affected_version_ids,selection_revision)
          SELECT $1,$2,$3,$4,u.use_id,$5,$6,u.version_owner_id,u.version_id,$7,$8 FROM artifacts.conversation_uses u WHERE u.owner_id=$1 AND u.use_id=$9`,
          [account, randomUUID(), conversation, operationId, replaced?.version_owner_id ?? null, replaced?.version_id ?? null, affected, reordered ? revision : null, id]);
        return result;
      });
    },
  });
}
