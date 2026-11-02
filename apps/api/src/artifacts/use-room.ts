import type { PoolClient } from 'pg';

/** A video holds at most this many uses. */
export const maxVideoUses = 100;

/** How many more uses the video can hold. */
export async function useRoom(client: Pick<PoolClient, 'query'>, account: string, conversation: string): Promise<number> {
  const count = (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2', [account, conversation])).rows[0]!.count;
  return Math.max(0, maxVideoUses - count);
}
