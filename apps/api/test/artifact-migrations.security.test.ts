import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostgresStore } from '@mastra/pg';
import { isolatedPostgres, query } from './postgres.js';
import { applyArtifactMigrations as migrate } from './artifact-database.js';
const nativeCatalog = `SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner,
  a.attname, format_type(a.atttypid,a.atttypmod) AS type
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  WHERE n.nspname='mastra' ORDER BY c.relname,a.attnum`;

test('CLI application migration and reapply preserve native schema and restrict serving grants', { timeout: 120000 }, async () => {
  const db = await isolatedPostgres();
  try {
    const native = new PostgresStore({ id: 'artifact-migration-fixture', connectionString: db.setupUrl, schemaName: 'mastra' });
    try { await native.init(); } finally { await native.close(); }
    await db.grantServing();
    const before = (await query(db.setupUrl, nativeCatalog)).rows;
    await migrate(db.setupUrl);
    assert.deepEqual((await query(db.setupUrl, nativeCatalog)).rows, before);
    const tables = (await query(db.setupUrl, "SELECT tablename FROM pg_tables WHERE schemaname='artifacts' ORDER BY tablename")).rows;
    assert.deepEqual(tables.map(row => row.tablename), ['artifacts', 'conversation_uses', 'publication_counters', 'version_dependencies', 'versions']);
    const history = (await query(db.setupUrl, 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')).rows;
    assert.equal(history.length, 2);
    await migrate(db.setupUrl);
    assert.deepEqual((await query(db.setupUrl, 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')).rows, history);
    assert.deepEqual((await query(db.setupUrl, nativeCatalog)).rows, before);
    assert.equal((await query(db.servingUrl, 'SELECT count(*)::int AS count FROM artifacts.versions')).rows[0]?.count, 0);
    for (const sql of [
      'CREATE TABLE artifacts.forbidden(id int)', 'CREATE SCHEMA forbidden',
      'ALTER TABLE artifacts.versions ADD COLUMN forbidden int',
      'UPDATE artifacts.versions SET revision=2', 'DELETE FROM artifacts.versions',
      'TRUNCATE artifacts.versions CASCADE', 'SET ROLE wp_setup', 'SET ROLE postgres',
      'SELECT * FROM supabase_migrations.schema_migrations',
    ]) await assert.rejects(query(db.servingUrl, sql), /./, 'Serving must reject schema setup, immutable mutation and privilege escalation');
    await assert.rejects(migrate(db.servingUrl), /Application CLI migration failed/);
    assert.equal((await query(db.servingUrl, "SELECT has_database_privilege(current_database(),'CREATE') AS allowed")).rows[0]?.allowed, false);
  } finally { await db.close(); }
});
