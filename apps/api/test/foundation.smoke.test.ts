import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { environment, root, sentinel } from './environment.js';
import { command, start, unusedPort } from './process.js';

const exec = promisify(execFile);

test('clean tracked export installs frozen, prepares, builds and serves built/development apps without provider activity', { timeout: 300000 }, async (t) => {
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  const checkout = join(fixture.logs, 'checkout');
  await mkdir(checkout);
  const archive = join(fixture.logs, 'source.tar');
  await exec('git', ['archive', '--format=tar', '-o', archive, 'HEAD'], { cwd: root });
  await exec('tar', ['-xf', archive, '-C', checkout]);
  const lock = join(checkout, 'pnpm-lock.yaml');
  const digest = async () => createHash('sha256').update(await readFile(lock)).digest('hex');
  const before = await digest();
  // Dependency downloads are permitted; all Node runtime/build networking below is guarded.
  await command('pnpm', ['install', '--frozen-lockfile'], {
    cwd: checkout, env: { PATH: process.env.PATH, HOME: process.env.HOME }, log: join(fixture.logs, 'install.log'),
  });
  for (const shared of ['contracts', 'api-client']) {
    await assert.rejects(stat(join(checkout, 'packages', shared, 'dist')), { code: 'ENOENT' }, 'Shared exports must be absent before documented startup');
  }
  const databaseLog = join(fixture.logs, 'local-database.log');
  const database = await start('pnpm', ['db:local'], {
    cwd: checkout,
    // An ambient setup URL must never redirect fixture preparation to another target.
    env: { ...fixture.env, MIGRATION_DATABASE_URL: 'postgresql://not-owned:unused@127.0.0.1:1/not_the_fixture' },
    log: databaseLog,
  });
  t.after(database.stop);
  const deadline = Date.now() + 30000;
  for (;;) {
    if ((await readFile(databaseLog, 'utf8')).includes('Isolated database ready.')) break;
    if (Date.now() > deadline) throw new Error(`Database fixture deadline exceeded; see ${databaseLog}`);
    await delay(100);
  }
  const env = { ...fixture.env, WORKPRINT_ENV_FILE: 'outputs/local-database.env' };
  await command('pnpm', ['db:prepare'], { cwd: checkout, env, log: join(fixture.logs, 'prepare-repeat.log') });
  for (const mode of ['dev', 'start']) {
    if (mode === 'start') await command('pnpm', ['build'], { cwd: checkout, env: fixture.env, log: join(fixture.logs, 'build.log') });
    const port = await unusedPort();
    const webPort = await unusedPort();
    const server = await start('pnpm', [mode], {
      cwd: checkout, env: { ...env, PORT: String(port), WEB_PORT: String(webPort) }, log: join(fixture.logs, `${mode}.log`),
    });
    try {
      assert.deepEqual(await (await server.response(`http://127.0.0.1:${port}/health`)).json(), { success: true });
      const html = await (await server.response(`http://127.0.0.1:${webPort}`)).text();
      assert.match(html, /Workprint/, 'The served application page retains its identity');
      const asset = html.match(/src="([^"]+\.(?:js|tsx))"/)?.[1];
      assert.ok(asset, 'HTML references a real JavaScript/TSX asset');
      const browser = await fetch(`http://127.0.0.1:${webPort}${asset}`, { signal: AbortSignal.timeout(2000) });
      assert.equal(browser.status, 200);
      const module = await browser.text();
      if (mode === 'dev') {
        assert.match(module, /import \{ Shell \} from ["']\/src\/shell\/shell\.tsx["']/, 'The served entry imports the production shell');
        const shell = await fetch(`http://127.0.0.1:${webPort}/src/shell/shell.tsx`, { signal: AbortSignal.timeout(2000) });
        assert.equal(shell.status, 200);
        assert.match(await shell.text(), /Workprint/, 'The imported production shell contains the application identity');
      } else assert.match(module, /Workprint/);
      if (mode === 'start') {
        for (const path of ['/?context=viewer', '/test/index.html', '/test/mount.tsx', '/test/library.html', '/test/library-mount.tsx', '/shell.html', '/test/shell.html', '/test/shell-mount.tsx']) {
          const response = await fetch(`http://127.0.0.1:${webPort}${path}`, { signal: AbortSignal.timeout(2000) });
          const text = await response.text();
          assert.doesNotMatch(text, /Isolated UI verification|Isolated Library|Isolated shell|Read-only details|mount\.tsx|libraryTest|shellTest/, 'Built serving cannot select test mounts');
        }
      }
    } finally { await server.stop(); }
    for (const address of [`http://127.0.0.1:${port}/health`, `http://127.0.0.1:${webPort}`]) {
      await assert.rejects(fetch(address, { signal: AbortSignal.timeout(1000) }), 'Owned listeners close after shutdown');
    }
  }
  await database.stop();
  await assert.rejects(readFile(join(checkout, 'outputs/local-database.env')), { code: 'ENOENT' });
  assert.equal(await digest(), before, 'Frozen install/build leave lockfile unchanged');
  for (const file of [...globSync(`${checkout}/apps/web/dist/**/*`), ...globSync(`${fixture.logs}/*.log`), ...globSync(`${checkout}/outputs/*.log`)]) {
    if ((await stat(file)).isFile()) {
      // This checks generated assets/logs for escaped credentials, not source snapshots.
      const contents = await readFile(file);
      assert.ok(!contents.includes(sentinel), `Secret escaped into ${file}`);
      if (file.startsWith(join(checkout, 'apps/web/dist'))) assert.doesNotMatch(contents.toString(), /Isolated UI verification|Isolated Library|Isolated shell|Read-only details|test\/mount|references\/flow|libraryTest|shellTest/, 'Test compositions are absent from browser artifacts');
    }
  }
  await fixture.noNetwork();
});
