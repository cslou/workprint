import type { Pool, PoolClient } from 'pg';

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

/** Include SET ROLE reachability, not only privileges inherited by the login. */
export async function assertRestrictedApplicationRole(pool: Pool) {
  const result = await pool.query<{ privileged: boolean }>(`WITH owned_schema AS (
    SELECT oid,nspowner FROM pg_namespace WHERE nspname='artifacts'
  ), owners AS (
    SELECT nspowner AS owner FROM owned_schema
    UNION SELECT relowner FROM pg_class WHERE relnamespace IN (SELECT oid FROM owned_schema)
    UNION SELECT proowner FROM pg_proc WHERE pronamespace IN (SELECT oid FROM owned_schema)
    UNION SELECT typowner FROM pg_type WHERE typnamespace IN (SELECT oid FROM owned_schema)
  ) SELECT has_database_privilege(current_database(),'CREATE') OR
    EXISTS(SELECT 1 FROM owned_schema WHERE has_schema_privilege(oid,'CREATE')) OR
    EXISTS(SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user,r.oid,'SET') AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole)) OR
    EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN owners WHERE pg_has_role(current_user,r.oid,'SET') AND pg_has_role(r.oid,owners.owner,'USAGE')) AS privileged`);
  if (result.rows[0]?.privileged !== false) throw new Error('Privileged application serving connection');
}
