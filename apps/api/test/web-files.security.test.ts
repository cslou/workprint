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
  const helper = 'apps/api/test/native-conversations.ts';
  await copyFile(join(root, helper), join(checkout, helper));
  paths.push(helper);
  for (const file of ['apps/api/test/artifact-database.ts', 'apps/api/test/saved-work.ts']) {
    await copyFile(join(root, file), join(checkout, file));
    paths.push(file);
  }
  const port = await unusedPort();
  const server = await start(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: web, env: fixture.env, log: join(fixture.logs, 'vite.log'),
  });
  try {
    const origin = `http://127.0.0.1:${port}`;
    assert.match(await (await server.response(origin)).text(), /src\/main.tsx/);
    const module = await (await server.response(`${origin}/src/main.tsx`)).text();
    assert.match(module, /import \{ Shell \} from/);
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
