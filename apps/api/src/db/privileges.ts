import type { Pool } from 'pg';

export type ServingRolePolicy = Readonly<{
  createSchemas: readonly string[];
  ownershipSchemas: readonly string[];
  requiredSchemas?: readonly string[];
  errorMessage: string;
}>;

/** Catalog/reachability mechanics only; callers supply their schema-specific policy. */
export async function assertRestrictedRole(pool: Pool, policy: ServingRolePolicy): Promise<void> {
  const result = await pool.query<{ privileged: boolean }>(`WITH protected_schema AS (
    SELECT oid FROM pg_namespace WHERE nspname=ANY($1::text[])
  ), owned_schema AS (
    SELECT oid,nspowner FROM pg_namespace WHERE nspname=ANY($2::text[])
  ), owners AS (
    SELECT nspowner AS owner FROM owned_schema
    UNION SELECT relowner FROM pg_class WHERE relnamespace IN (SELECT oid FROM owned_schema)
    UNION SELECT proowner FROM pg_proc WHERE pronamespace IN (SELECT oid FROM owned_schema)
    UNION SELECT typowner FROM pg_type WHERE typnamespace IN (SELECT oid FROM owned_schema)
  ), reachable_role AS (
    SELECT * FROM pg_roles WHERE pg_has_role(current_user,oid,'SET')
  ) SELECT
    EXISTS(SELECT 1 FROM unnest($3::text[]) AS required(name)
      WHERE NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=required.name)) OR
    has_database_privilege(current_database(),'CREATE') OR
    EXISTS(SELECT 1 FROM protected_schema WHERE has_schema_privilege(oid,'CREATE')) OR
    EXISTS(SELECT 1 FROM reachable_role r WHERE r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR
      has_database_privilege(r.oid,current_database(),'CREATE') OR
      EXISTS(SELECT 1 FROM protected_schema n WHERE has_schema_privilege(r.oid,n.oid,'CREATE'))) OR
    EXISTS(SELECT 1 FROM reachable_role r CROSS JOIN owners WHERE pg_has_role(r.oid,owners.owner,'USAGE')) AS privileged`,
  [policy.createSchemas, policy.ownershipSchemas, policy.requiredSchemas ?? []]);
  if (result.rows[0]?.privileged !== false) throw new Error(policy.errorMessage);
}
