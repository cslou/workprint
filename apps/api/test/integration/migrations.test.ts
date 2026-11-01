import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { assertRestrictedApplicationRole } from '../../src/db/index.js';
import { isolatedPostgres, query } from '../support/postgres.js';
import { applyArtifactMigrations as migrate } from '../support/artifact-database.js';

const nativeCatalog = `SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner,
  a.attname, format_type(a.atttypid,a.atttypmod) AS type
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  WHERE n.nspname='mastra' ORDER BY c.relname,a.attnum`;
const migrationVersions = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).map(name => name.split('_')[0]).sort();
const history = async (url: string) => (await query(url, 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')).rows.map(row => row.version as string);

describe('application migrations and database roles', { timeout: 180000 }, () => {
  let db: Awaited<ReturnType<typeof isolatedPostgres>>;
  let nativeBefore: unknown[];
  before(async () => {
    db = await isolatedPostgres();
    const native = new PostgresStore({ id: 'artifact-migration-fixture', connectionString: db.setupUrl, schemaName: 'mastra' });
    try { await native.init(); } finally { await native.close(); }
    await db.grantServing();
    nativeBefore = (await query(db.setupUrl, nativeCatalog)).rows;
    await migrate(db.setupUrl);
  });
  after(() => db?.close());

  test('every migration applies once and re-applying changes nothing', async () => {
    assert.deepEqual(await history(db.setupUrl), migrationVersions);
    assert.deepEqual((await query(db.setupUrl, nativeCatalog)).rows, nativeBefore, 'Application migrations leave the native schema untouched');
    await migrate(db.setupUrl);
    assert.deepEqual(await history(db.setupUrl), migrationVersions);
    assert.deepEqual((await query(db.setupUrl, nativeCatalog)).rows, nativeBefore);
  });

  test('the serving role cannot change schema, rewrite immutable rows or escalate', async () => {
    assert.equal((await query(db.servingUrl, 'SELECT count(*)::int AS count FROM artifacts.versions')).rows[0]?.count, 0);
    for (const sql of [
      'CREATE TABLE artifacts.forbidden(id int)', 'CREATE SCHEMA forbidden',
      'ALTER TABLE artifacts.versions ADD COLUMN forbidden int',
      'UPDATE artifacts.versions SET revision=2', 'DELETE FROM artifacts.versions',
      'UPDATE artifacts.uploads SET byte_size=1', 'DELETE FROM artifacts.uploads',
      'UPDATE artifacts.upload_confirmations SET operation_id=operation_id', 'DELETE FROM artifacts.upload_confirmations',
      'UPDATE artifacts.upload_objects SET object_key=object_key', 'DELETE FROM artifacts.upload_objects',
      'UPDATE artifacts.media_objects SET object_key=object_key', 'DELETE FROM artifacts.media_objects',
      'TRUNCATE artifacts.versions CASCADE', 'SET ROLE wp_setup', 'SET ROLE postgres',
      'SELECT * FROM supabase_migrations.schema_migrations',
    ]) await assert.rejects(query(db.servingUrl, sql), { code: '42501' }, sql);
    await assert.rejects(migrate(db.servingUrl), /Application CLI migration failed/);
    assert.equal((await query(db.servingUrl, "SELECT has_database_privilege(current_database(),'CREATE') AS allowed")).rows[0]?.allowed, false);
  });

  test('a settable but non-inherited role with CREATE makes the serving connection refuse to start', async t => {
    const pool = new Pool({ connectionString: db.servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
    try {
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
    } finally { await pool.end(); }
  });
});
