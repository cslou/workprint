import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { environment, root, sentinel } from './environment.js';
import { isolatedPostgres, query } from './postgres.js';
import { command, start, unusedPort } from './process.js';

// Reuse the same built production runtime. No fixture provider/control is registered.
test('built backend rejects unsafe config, separates setup privileges and excludes controls/secrets', { timeout: 240000 }, async (t) => {
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  await command('pnpm', ['build'], { cwd: root, env: fixture.env, log: join(fixture.logs, 'build.log') });
  const db = await isolatedPostgres();
  t.after(db.close);
  const prepare = async (url: string, name: string) => {
    const setup = await start(process.execPath, ['apps/api/dist/src/mastra/prepare.js'], {
      cwd: root, env: { ...fixture.env, MIGRATION_DATABASE_URL: url }, log: join(fixture.logs, `${name}.log`),
    });
    try { return await setup.exited; } finally { await setup.stop(); }
  };
  assert.notEqual(await prepare(db.servingUrl, 'serving-before'), 0);
  assert.equal(await prepare(db.setupUrl, 'setup'), 0);
  assert.equal(await prepare(db.setupUrl, 'setup-repeat'), 0, 'Supported initialization is repeatable');
  await db.grantServing();
  assert.notEqual(await prepare(db.servingUrl, 'serving-after'), 0);
  const privilegeSql = `SELECT has_database_privilege(current_database(), 'CREATE') AS database_create, has_schema_privilege('mastra', 'CREATE') AS schema_create, has_schema_privilege('public', 'CREATE') AS public_create, (SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = current_user) AS privileged`;
  const privileges = await query(db.servingUrl, privilegeSql);
  assert.deepEqual(privileges.rows[0], { database_create: false, schema_create: false, public_create: false, privileged: false });
  const owners = await query(db.setupUrl, "SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'mastra'");
  assert.deepEqual(owners.rows, [{ tableowner: 'wp_setup' }]);
  // A native-store read uses serving grants without requiring setup privileges.
  const { PostgresStore } = await import('@mastra/pg');
  const store = new PostgresStore({ id: 'foundation-serving-check', connectionString: db.servingUrl, schemaName: 'mastra', disableInit: true });
  try {
    const memory = await store.getStore('memory');
    assert.ok(memory);
    const threads = await memory.listThreads({ page: 0, perPage: 10 });
    assert.deepEqual(threads.threads, []);
  } finally { await store.close(); }

  for (const [name, model] of [['missing', ''], ['invalid', `https://${sentinel}`]]) {
    const invalid = await start(process.execPath, ['apps/api/.mastra/output/index.mjs'], {
      cwd: root, env: { ...fixture.env, DATABASE_URL: db.servingUrl, DEFAULT_ASSISTANT_MODEL: model }, log: join(fixture.logs, `${name}.log`),
    });
    try {
      assert.notEqual(await invalid.exited, 0);
      assert.match(await readFile(join(fixture.logs, `${name}.log`), 'utf8'), /Invalid or missing server configuration: DEFAULT_ASSISTANT_MODEL/);
    } finally { await invalid.stop(); }
  }

  const privileged = await start(process.execPath, ['apps/api/.mastra/output/index.mjs'], {
    cwd: root, env: { ...fixture.env, DATABASE_URL: db.setupUrl }, log: join(fixture.logs, 'privileged-serving.log'),
  });
  try {
    assert.notEqual(await privileged.exited, 0);
    assert.match(await readFile(join(fixture.logs, 'privileged-serving.log'), 'utf8'), /Serving storage unavailable or privileged/);
  } finally { await privileged.stop(); }

  // Owners retain DDL authority even after ordinary CREATE grants are revoked.
  // Change only fixture roles/grants, never native table/schema definitions.
  await query(db.adminUrl, 'CREATE ROLE wp_owner_bridge NOLOGIN; REVOKE CREATE ON DATABASE workprint FROM wp_setup; REVOKE CREATE ON SCHEMA mastra, public FROM wp_setup; REVOKE CREATE ON SCHEMA public FROM pg_database_owner');
  try {
    for (const [name, url] of [['native-owner', db.setupUrl], ['inherited-owner', db.servingUrl], ['settable-owner', db.servingUrl], ['mixed-chain-owner', db.servingUrl]] as const) {
      if (name === 'inherited-owner') await query(db.adminUrl, 'GRANT wp_setup TO wp_serving');
      if (name === 'settable-owner') await query(db.adminUrl, 'GRANT wp_setup TO wp_serving WITH INHERIT FALSE');
      if (name === 'mixed-chain-owner') {
        await query(db.adminUrl, 'REVOKE wp_setup FROM wp_serving; GRANT wp_setup TO wp_owner_bridge WITH SET FALSE; GRANT wp_owner_bridge TO wp_serving WITH INHERIT FALSE');
        const chain = await query(url, "SELECT pg_has_role(current_user, 'wp_setup', 'USAGE') AS owner_inherited, pg_has_role(current_user, 'wp_setup', 'SET') AS owner_settable, pg_has_role(current_user, 'wp_owner_bridge', 'USAGE') AS bridge_inherited, pg_has_role(current_user, 'wp_owner_bridge', 'SET') AS bridge_settable, pg_has_role('wp_owner_bridge', 'wp_setup', 'USAGE') AS bridge_inherits_owner, pg_has_role('wp_owner_bridge', 'wp_setup', 'SET') AS bridge_sets_owner");
        assert.deepEqual(chain.rows[0], { owner_inherited: false, owner_settable: false, bridge_inherited: false, bridge_settable: true, bridge_inherits_owner: true, bridge_sets_owner: false });
      }
      assert.deepEqual((await query(url, privilegeSql)).rows[0], { database_create: false, schema_create: false, public_create: false, privileged: false });
      const ownership = await query(url, "SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'mastra' AND (pg_has_role(current_user, c.relowner, 'USAGE') OR pg_has_role(current_user, c.relowner, 'SET'))) AS owned");
      assert.equal(ownership.rows[0]?.owned, name !== 'mixed-chain-owner', 'Direct ownership flags deliberately miss the mixed chain');
      if (name === 'settable-owner') assert.deepEqual((await query(url, "SELECT pg_has_role(current_user, 'wp_setup', 'USAGE') AS inherited, pg_has_role(current_user, 'wp_setup', 'SET') AS settable")).rows[0], { inherited: false, settable: true });
      const ownerPort = await unusedPort();
      const ownerLog = join(fixture.logs, `${name}.log`);
      const owner = await start(process.execPath, ['apps/api/.mastra/output/index.mjs'], {
        cwd: root, env: { ...fixture.env, DATABASE_URL: url, PORT: String(ownerPort) }, log: ownerLog,
      });
      try {
        const code = await Promise.race([owner.exited, owner.response(`http://127.0.0.1:${ownerPort}/health`).then(async (response) => { await response.body?.cancel(); return 0; })]);
        assert.notEqual(code, 0, `${name} must be rejected despite lacking CREATE/elevated attributes`);
        assert.match(await readFile(ownerLog, 'utf8'), /Serving storage unavailable or privileged/);
      } finally { await owner.stop(); }
    }
  } finally {
    await query(db.adminUrl, 'REVOKE wp_setup FROM wp_serving; REVOKE wp_owner_bridge FROM wp_serving; REVOKE wp_setup FROM wp_owner_bridge; DROP ROLE wp_owner_bridge; GRANT CREATE ON DATABASE workprint TO wp_setup; GRANT CREATE ON SCHEMA mastra TO wp_setup; GRANT CREATE ON SCHEMA public TO pg_database_owner');
  }

  const port = await unusedPort();
  const server = await start(process.execPath, ['apps/api/.mastra/output/index.mjs'], {
    cwd: root,
    env: { ...fixture.env, DATABASE_URL: db.servingUrl, PORT: String(port), WORKPRINT_TEST_PROVIDER: 'fake', WORKPRINT_TEST_BARRIER: 'enabled' },
    log: join(fixture.logs, 'server.log'),
  });
  t.after(server.stop);
  const origin = `http://127.0.0.1:${port}`;
  assert.deepEqual(await (await server.response(`${origin}/health`)).json(), { success: true });
  for (const [method, path] of [
    ['GET', '/__qualification'], ['POST', '/__qualification/release'],
    ['GET', '/api/agents'], ['GET', '/api/workflows'], ['POST', '/api/tools/test/execute'],
    ['GET', '/swagger-ui'], ['GET', '/openapi.json'], ['POST', '/health'],
  ] as const) {
    const response = await fetch(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${sentinel}` }, signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.doesNotMatch(await response.text(), new RegExp(sentinel));
  }
  await server.stop();
  for (const path of [...globSync('apps/web/dist/**/*'), ...globSync(`${fixture.logs}/*.log`)]) {
    if ((await stat(path)).isFile()) assert.ok(!(await readFile(path)).includes(sentinel), `Secret escaped into ${path}`);
  }
  await fixture.noNetwork();
});
