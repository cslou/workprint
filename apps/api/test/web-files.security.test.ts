import assert from 'node:assert/strict';
import { copyFile, cp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { environment, root, sentinel } from './environment.js';
import { start, unusedPort } from './process.js';

test('Vite serves browser modules but denies private research and fixture credentials through /@fs', { timeout: 60000 }, async (t) => {
  const fixture = await environment();
  const checkout = join(fixture.logs, 'workspace');
  const web = join(checkout, 'apps/web');
  await mkdir(join(web, 'src'), { recursive: true });
  await mkdir(join(checkout, 'docs/research'), { recursive: true });
  await mkdir(join(checkout, 'outputs'), { recursive: true });
  await mkdir(join(checkout, 'apps/api/test'), { recursive: true });
  for (const file of ['package.json', 'pnpm-workspace.yaml']) await copyFile(join(root, file), join(checkout, file));
  for (const file of ['package.json', 'vite.config.ts', 'index.html']) await copyFile(join(root, 'apps/web', file), join(web, file));
  await cp(join(root, 'apps/web/src'), join(web, 'src'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(checkout, 'node_modules'), 'dir');
  await symlink(join(root, 'apps/web/node_modules'), join(web, 'node_modules'), 'dir');
  const paths = ['docs/research/synthetic-private.md', 'outputs/local-database.env'];
  for (const file of paths) await writeFile(join(checkout, file), sentinel);
  for (const name of ['native-conversations.ts', 'built-server.ts', 'server-entry.test.ts', 'auth-built-fixture.ts', 'auth-server.ts', 'request-intake.test.ts', 'isolated-auth.ts', 'auth-fixture-resources.ts', 'auth-mail.ts', 'isolated-auth.security.test.ts', 'account-browser-fixture.ts', 'native-navigation.test.ts', 'native-client.contracts.test.ts', 'native-control-provider.ts', 'native-control-fixture.ts', 'native-turn-control.test.ts', 'native-turn-control-client.test.ts', 'native-workflow-budget.ts', 'native-workflow-definition.ts', 'native-workflow-provider.ts', 'native-workflow-fixture.ts', 'native-workflow.test.ts', 'native-workflow-outcome.ts', 'native-workflow-outcome.test.ts', 'native-workflow-persistence.test.ts', 'native-recovery-setup.ts', 'native-recovery-store.ts', 'native-recovery-barrier.ts', 'native-recovery-definition.ts', 'native-recovery-provider.ts', 'native-recovery.test.ts']) {
    const helper = `apps/api/test/${name}`;
    await copyFile(join(root, helper), join(checkout, helper));
    paths.push(helper);
  }
  const port = await unusedPort();
  const server = await start(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: web, env: fixture.env, log: join(fixture.logs, 'vite.log'),
  });
  try {
    const origin = `http://127.0.0.1:${port}`;
    assert.match(await (await server.response(origin)).text(), /src\/main.tsx/);
    const module = await (await server.response(`${origin}/src/main.tsx`)).text();
    assert.match(module, /import \{ OwnedShell \} from/);
    const composition = await (await server.response(`${origin}/src/shell/owned-shell.tsx`)).text();
    assert.match(composition, /import \{ Shell \} from/);
    assert.match(composition, /useNativeNavigation/);
    assert.match(await (await server.response(`${origin}/src/shell/shell.tsx`)).text(), /Workprint/);
    const dependency = module.match(/from "([^"]*react-dom[^"]*)"/)?.[1];
    assert.ok(dependency, 'Transformed module uses a real React dependency');
    assert.equal((await fetch(new URL(dependency, origin))).status, 200);
    for (const file of paths) {
      const response = await fetch(`${origin}/@fs/${await realpath(join(checkout, file))}`, { signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 403, file);
      assert.doesNotMatch(await response.text(), new RegExp(sentinel));
    }
    assert.doesNotMatch(await readFile(join(fixture.logs, 'vite.log'), 'utf8'), new RegExp(sentinel));
  } finally { await server.stop(); }
  await fixture.noNetwork();
  t.diagnostic(`Evidence: ${fixture.logs}`);
});
