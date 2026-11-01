import type { PoolClient } from 'pg';
import { savedStoryboardContentSchema } from '@workprint/contracts';
import { canonicalJson } from './manual-content.js';

type Query = Pick<PoolClient, 'query'>;
type Plan = { shots: readonly { shotId: string; order: number; intent?: string | undefined; panels: readonly { order: number }[] }[] } | null;

/** Zero until the conversation's first saved Shot-order or Shot-video choice change. */
export async function selectionRevision(client: Query, account: string, conversation: string): Promise<number> {
  const row = (await client.query<{ revision: string }>('SELECT revision::text FROM artifacts.selection_revisions WHERE owner_id=$1 AND conversation_id=$2', [account, conversation])).rows[0];
  return row ? Number(row.revision) : 0;
}
/** The upsert's row lock serializes concurrent advances; each committed change advances exactly once. */
export async function advanceSelectionRevision(client: Query, account: string, conversation: string): Promise<number> {
  const row = (await client.query<{ revision: string }>(`INSERT INTO artifacts.selection_revisions(owner_id,conversation_id,revision) VALUES($1,$2,1)
    ON CONFLICT(owner_id,conversation_id) DO UPDATE SET revision=selection_revisions.revision+1,updated_at=clock_timestamp() RETURNING revision::text`, [account, conversation])).rows[0]!;
  return Number(row.revision);
}
/** The ordered Shot identities a selection revision orders; text and Panel edits do not change it. */
export function shotSequence(plan: Plan): readonly string[] {
  return plan ? [...plan.shots].sort((a, b) => a.order - b.order).map(shot => shot.shotId) : [];
}
export function shotOrderChanged(before: Plan, after: Plan): boolean {
  return canonicalJson(shotSequence(before)) !== canonicalJson(shotSequence(after));
}
/** Shots whose plan changed. Every Panel of a changed Shot is revalidated, including siblings. */
export function changedShots(before: Plan, after: Plan): ReadonlySet<string> {
  const previous = new Map((before?.shots ?? []).map(shot => [shot.shotId, shot]));
  const changed = new Set<string>();
  for (const shot of after?.shots ?? []) {
    const old = previous.get(shot.shotId);
    const plan = (value: typeof shot) => canonicalJson({ intent: value.intent, panels: [...value.panels].sort((a, b) => a.order - b.order) });
    if (!old || plan(old) !== plan(shot)) changed.add(shot.shotId);
  }
  for (const shotId of previous.keys()) if (!after?.shots.some(shot => shot.shotId === shotId)) changed.add(shotId);
  return changed;
}
/** Exact Panel images and Shot videos bound to changed Shots in this conversation. Nothing is moved or erased. */
export async function affectedVersions(client: Query, account: string, conversation: string, shots: ReadonlySet<string>): Promise<string[]> {
  if (!shots.size) return [];
  const rows = (await client.query<{ version_id: string }>(`SELECT DISTINCT u.version_id FROM artifacts.conversation_uses u
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose IN ('panel_image','shot_video') AND u.binding->>'shotId' = ANY($3::text[])
    ORDER BY u.version_id`, [account, conversation, [...shots]])).rows;
  return rows.map(row => row.version_id);
}
/** Uses in this conversation built on a superseded upstream version, plus the Panel images and Shot videos
 * of every Shot whose plan cites it. A changed source Script has unknown planning impact, so all Shots count. */
export async function upstreamAffected(client: Query, account: string, conversation: string, upstream: string): Promise<string[]> {
  const dependents = (await client.query<{ version_id: string; purpose: string; content: unknown }>(`SELECT DISTINCT u.version_id,u.purpose,v.content FROM artifacts.conversation_uses u
    JOIN artifacts.version_dependencies d ON d.owner_id=u.version_owner_id AND d.version_id=u.version_id
    JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND d.dependency_id=$3`, [account, conversation, upstream])).rows;
  const shots = new Set<string>();
  for (const row of dependents) {
    const plan = row.purpose === 'storyboard' ? savedStoryboardContentSchema.safeParse(row.content).data : undefined;
    for (const shot of plan?.shots ?? []) if (plan!.sourceScriptVersionId === upstream || shot.panels.some(panel => panel.references.includes(upstream))) shots.add(shot.shotId);
  }
  return [...new Set([...dependents.map(row => row.version_id), ...await affectedVersions(client, account, conversation, shots)])].sort();
}
