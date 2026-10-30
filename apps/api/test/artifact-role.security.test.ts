import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { assertRestrictedApplicationRole } from '../src/db/index.js';
import { isolatedPostgres, query } from './postgres.js';
import { applyArtifactMigrations } from './artifact-database.js';

test('SET-reachable non-inherited roles cannot create application objects or schemas', { timeout: 120000 }, async t => {
  const db = await isolatedPostgres();
  const pool = new Pool({ connectionString: db.servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try {
    await applyArtifactMigrations(db.setupUrl);
    await assertRestrictedApplicationRole(pool);
    await query(db.adminUrl, 'CREATE ROLE wp_application_creator NOLOGIN; GRANT wp_application_creator TO wp_serving WITH INHERIT FALSE');
    for (const object of ['SCHEMA artifacts', 'DATABASE workprint']) await t.test(object, async () => {
      await query(db.adminUrl, `GRANT CREATE ON ${object} TO wp_application_creator`);
      try {
        const state = await pool.query("SELECT pg_has_role(current_user,'wp_application_creator','USAGE') AS inherited,pg_has_role(current_user,'wp_application_creator','SET') AS settable,has_database_privilege(current_database(),'CREATE') AS database_create,has_schema_privilege('artifacts','CREATE') AS schema_create");
        assert.deepEqual(state.rows[0], { inherited: false, settable: true, database_create: false, schema_create: false });
        await assert.rejects(assertRestrictedApplicationRole(pool), /Privileged application serving connection/);
      } finally { await query(db.adminUrl, `REVOKE CREATE ON ${object} FROM wp_application_creator`); }
    });
  } finally { await pool.end(); await db.close(); }
});
