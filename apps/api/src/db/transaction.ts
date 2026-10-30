import type { Pool, PoolClient } from 'pg';
import { assertRestrictedRole } from './privileges.js';

/** Mechanics only. Callers own SQL; never wait on native/provider collaborators here. */
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let expired = false;
  const timer = setTimeout(() => { expired = true; client.release(true); }, 8000);
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '3s'; SET LOCAL idle_in_transaction_session_timeout = '1s'");
    const result = await work(client);
    if (expired) throw new Error('Application transaction deadline exceeded');
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (!expired) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Application transaction and rollback failed', { cause: rollbackError }); }
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (!expired) client.release();
  }
}

/** Application checks do not require native bootstrap schemas. */
export function assertRestrictedApplicationRole(pool: Pool): Promise<void> {
  return assertRestrictedRole(pool, { createSchemas: ['artifacts'], ownershipSchemas: ['artifacts'], errorMessage: 'Privileged application serving connection' });
}
