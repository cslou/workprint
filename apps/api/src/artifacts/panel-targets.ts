import type { PoolClient } from 'pg';
import { savedStoryboardContentSchema } from '@workprint/contracts';

type Query = Pick<PoolClient, 'query'>;
/** A Shot, or one of its panels, in the storyboard the video uses. */
export type DecisionTarget = Readonly<{ shotId: string; panelId?: string | undefined }>;

export const storyboardPlan = (content: unknown) => savedStoryboardContentSchema.safeParse(content).data ?? null;

/** The conversation's used Storyboard; `lock` holds it against concurrent replacement while a decision binds to it. */
export async function usedPlan(client: Query, account: string, conversation: string, lock: boolean) {
  return (await client.query<{ version_id: string; version_owner_id: string; content: unknown }>(`SELECT u.version_id,u.version_owner_id,v.content FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='storyboard'${lock ? ' FOR SHARE OF u' : ''}`, [account, conversation])).rows[0];
}

/** Whether a used Storyboard's content has the target: the Shot, and when a panel is named, that panel under it. */
export function hasTarget(content: unknown, target: DecisionTarget): boolean {
  const shot = storyboardPlan(content)?.shots.find(item => item.shotId === target.shotId);
  return Boolean(shot && (target.panelId === undefined || shot.panels.some(panel => panel.panelId === target.panelId)));
}
