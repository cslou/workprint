import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { idSchema, operations, savedReferenceContentSchema, savedStoryboardContentSchema, type OperationRequest, type OperationResponse, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { assertContentDependencies, parseContent } from './content.js';
import { ArtifactError } from './errors.js';
import { canonicalJson } from './manual-content.js';
import { publishVersion } from './publication.js';
import { affectedVersions, advanceSelectionRevision, changedShots, selectionRevision, shotOrderChanged } from './selection.js';
import { createArtifactStore } from './store.js';
import { panelReferences, shotSubjects, storyboardDependencies } from './storyboard-dependencies.js';

type Command = OperationRequest<'editStoryboard'>['body'];
type Result = OperationResponse<'editStoryboard'>;
type Query = Pick<PoolClient, 'query'>;
type Plan = ReturnType<typeof savedStoryboardContentSchema.parse>;

/** Edits only the existing Shots/Panels of the conversation's used Storyboard; it never creates or removes them. */
function editedPlan(base: Plan, shots: Command['shots']): Plan {
  const previous = new Map(base.shots.map(shot => [shot.shotId, shot]));
  if (shots.length !== previous.size || new Set(shots.map(shot => shot.shotId)).size !== shots.length) throw new ArtifactError('invalid_input');
  const next = shots.map(shot => {
    const old = previous.get(shot.shotId);
    if (!old || shot.panels.length !== old.panels.length || new Set(shot.panels.map(panel => panel.panelId)).size !== shot.panels.length) throw new ArtifactError('invalid_input');
    // A person edits intent, length and panel text only; the assistant's other Shot fields (framing, action, dialogue,
    // camera note and subject references) are kept from the base unchanged.
    const durationS = shot.durationS ?? old.durationS;
    const { panels: oldPanels, ...fields } = old;
    const panels = new Map(oldPanels.map(panel => [panel.panelId, panel]));
    return { ...fields, shotId: shot.shotId, order: shot.order, intent: shot.intent ?? old.intent, ...(durationS !== undefined ? { durationS } : {}), panels: shot.panels.map(panel => {
      const current = panels.get(panel.panelId);
      if (!current) throw new ArtifactError('invalid_input');
      return { panelId: panel.panelId, order: panel.order, description: panel.description ?? current.description, references: [...panel.references] };
    }).sort((a, b) => a.order - b.order) };
  }).sort((a, b) => a.order - b.order);
  try { return savedStoryboardContentSchema.parse(parseContent('storyboard', { schemaVersion: 1, sourceScriptVersionId: base.sourceScriptVersionId, shots: next })); }
  catch { throw new ArtifactError('invalid_input'); }
}

/** Human Storyboard edit capability. Order changes advance the selection revision in the same transaction. */
export function createStoryboardEdits(pool: Pool, checkOwnedConversation: Parameters<typeof createArtifactStore>[1]) {
  const reads = createArtifactStore(pool, checkOwnedConversation);
  return Object.freeze({
    async editStoryboard(account: string, conversation: string, input: Command): Promise<Result> {
      const parsed = operations.editStoryboard.request.safeParse({ params: { id: conversation }, query: {}, body: input });
      if (!idSchema.safeParse(account).success || !parsed.success) throw new ArtifactError('invalid_input');
      const body = parsed.data.body;
      const owned = await checkOwnedConversation(account, conversation);
      if (owned.kind !== 'owned') throw new ArtifactError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
      const scope = [account, conversation, 'edit_storyboard', body.operationId];
      const hash = createHash('sha256').update(canonicalJson(body)).digest('hex');
      const replay = async (client: Query): Promise<Result | undefined> => {
        const row = (await client.query<{ payload_hash: string; result: unknown }>('SELECT payload_hash,result FROM artifacts.commands WHERE owner_id=$1 AND conversation_id=$2 AND command_kind=$3 AND operation_id=$4', scope)).rows[0];
        if (!row) return undefined;
        if (row.payload_hash !== hash) throw new ArtifactError('invalid_input');
        const result = operations.editStoryboard.response.safeParse(row.result);
        if (!result.success) throw new ArtifactError('integration_failure');
        return result.data;
      };
      const previous = await replay(pool);
      if (previous) return previous;

      // Native ownership, exact version and dependency inspection complete before SQL locking.
      const used = (await pool.query<{ use_id: string; version_id: string }>("SELECT use_id,version_id FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2 AND purpose='storyboard'", [account, conversation])).rows[0];
      if (!used) throw new ArtifactError('not_found');
      const base = await reads.version(account, body.baseVersionId);
      const current = await reads.version(account, used.version_id);
      if (base.kind !== 'storyboard' || current.kind !== 'storyboard' || base.artifactId !== current.artifactId || !('content' in base) || !('content' in current)) throw new ArtifactError('not_found');
      if (base.builtIn) throw new ArtifactError('invalid_input');
      if (base.id !== current.id) {
        // A lost response can commit between the first replay check and this read.
        const committed = await replay(pool);
        if (committed) return committed;
        throw new ArtifactError('stale_revision');
      }
      const before = savedStoryboardContentSchema.parse(current.content);
      const basePlan = savedStoryboardContentSchema.parse(base.content);
      const content = editedPlan(basePlan, body.shots);
      if (canonicalJson(content) === canonicalJson(before)) throw new ArtifactError('invalid_input');
      // The base's Shot-subject sheets carry over unchanged. A base dependency that wasn't a panel reference is one of
      // them; a panel reference this edit drops stays only when it is a sheet of a subject the Shots still name.
      const references = panelReferences(content), baseLinks = new Set(panelReferences(basePlan)), subjects = new Set(shotSubjects(content));
      const sheets: string[] = [];
      for (const id of base.dependencies) {
        if (id === content.sourceScriptVersionId || references.includes(id)) continue;
        if (!baseLinks.has(id)) sheets.push(id);
        else if (subjects.size) {
          const dropped = await reads.version(account, id);
          const sheet = 'content' in dropped ? savedReferenceContentSchema.safeParse(dropped.content).data : undefined;
          if (sheet && subjects.has(sheet.subject.id)) sheets.push(id);
        }
      }
      const dependencies = storyboardDependencies(content, sheets);
      if (dependencies.length > 100) throw new ArtifactError('invalid_input');
      const resolved = new Map<string, Version>();
      for (const id of dependencies) resolved.set(id, await reads.version(account, id));
      assertContentDependencies(content, resolved);
      const reordered = shotOrderChanged(before, content), changed = changedShots(before, content);

      return transaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [canonicalJson(['artifact-command', ...scope])]);
        const retried = await replay(client);
        if (retried) return retried;
        const version = await publishVersion(client, { accountId: account, conversationId: conversation, artifactId: base.artifactId, baseVersionId: base.id, kind: 'storyboard', content, dependencies, createdBy: 'human' });
        const locked = (await client.query<{ use_id: string; version_id: string }>("SELECT use_id,version_id FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2 AND purpose='storyboard' FOR UPDATE", [account, conversation])).rows[0];
        if (!locked || locked.use_id !== used.use_id || locked.version_id !== used.version_id) throw new ArtifactError('stale_revision');
        await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='approved' WHERE owner_id=$2 AND use_id=$3", [version.id, account, used.use_id]);
        const revision = reordered ? await advanceSelectionRevision(client, account, conversation) : await selectionRevision(client, account, conversation);
        const affected = await affectedVersions(client, account, conversation, changed);
        const result = operations.editStoryboard.response.parse({ version, selectionRevision: revision, affected });
        await client.query('INSERT INTO artifacts.commands(owner_id,conversation_id,command_kind,operation_id,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6)', [...scope, hash, result]);
        await client.query(`INSERT INTO artifacts.manual_changes(owner_id,change_id,conversation_id,operation_id,command_kind,previous_version_id,version_id,use_id,previous_use_version_id,affected_version_ids,selection_revision)
          VALUES($1,$2,$3,$4,'edit_storyboard',$5,$6,$7,$8,$9,$10)`, [account, randomUUID(), conversation, body.operationId, base.id, version.id, used.use_id, used.version_id, affected, reordered ? revision : null]);
        return result;
      });
    },
  });
}
