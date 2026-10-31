import type { Pool } from 'pg';
import { z } from 'zod';

export const recoveryBoundaries = ['committed-before-start', 'started-before-ack', 'waiting', 'effect-before-step-ack'] as const;
export const recoveryBoundary = z.union([z.enum(recoveryBoundaries), z.literal('run-deadline')]);
const intentSchema = z.object({ logicalId: z.uuid(), runId: z.uuid(), resourceId: z.uuid(), boundary: recoveryBoundary,
  committedAt: z.date(), waitDeadline: z.date(), runDeadline: z.date() });
export type RecoveryIntent = z.infer<typeof intentSchema>;
const columns = 'logical_id AS "logicalId", run_id AS "runId", resource_id AS "resourceId", boundary, committed_at AS "committedAt", wait_deadline AS "waitDeadline", run_deadline AS "runDeadline"';

/** Test fixture SQL only; never native workflow SQL or a production business ledger. */
export function nativeRecoveryStore(pool: Pool) {
  const get = async (logicalId: string, resourceId: string) => {
    const result = await pool.query(`SELECT ${columns} FROM qualification.intent WHERE logical_id=$1 AND resource_id=$2`, [logicalId, resourceId]);
    return result.rows[0] ? intentSchema.parse(result.rows[0]) : undefined;
  };
  return { get,
    put: async (logicalId: string, runId: string, resourceId: string, boundary: RecoveryIntent['boundary']) => {
      await pool.query('INSERT INTO qualification.intent(logical_id,run_id,resource_id,boundary) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [logicalId, runId, resourceId, boundary]);
      const intent = await get(logicalId, resourceId);
      if (!intent || intent.boundary !== boundary) throw new Error('Recovery intent binding unavailable or inconsistent');
      return intent;
    },
    list: async (resourceId?: string) => {
      const result = await pool.query(`SELECT ${columns} FROM qualification.intent WHERE ($1::uuid IS NULL OR resource_id=$1) ORDER BY committed_at LIMIT 101`, [resourceId ?? null]);
      if (result.rows.length > 100) throw new Error('Recovery fixture reconciliation page incomplete');
      return result.rows.map(row => intentSchema.parse(row));
    },
    effect: async (intent: RecoveryIntent) => (await pool.query('INSERT INTO qualification.effect(logical_id,run_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [intent.logicalId, intent.runId])).rowCount,
  };
}
