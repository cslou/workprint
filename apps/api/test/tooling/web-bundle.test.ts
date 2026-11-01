import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { environment, root, sentinel } from '../support/environment.js';
import { command } from '../support/process.js';

const accessKey = 'private-storage-build-sentinel-access', secretKey = 'private-storage-build-sentinel-secret';

test('the production web bundle contains no test code or backend secrets', { timeout: 120000 }, async () => {
  const fixture = await environment();
  const output = join(fixture.logs, 'web-dist');
  await command(process.execPath, [join(root, 'apps/web/node_modules/vite/bin/vite.js'), 'build', '--outDir', output], {
    cwd: join(root, 'apps/web'), env: { ...fixture.env, S3_ACCESS_KEY_ID: accessKey, S3_SECRET_ACCESS_KEY: secretKey }, log: join(fixture.logs, 'web-build.log'),
  });
  const emitted = await Promise.all(readdirSync(output, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => readFile(join(entry.parentPath, entry.name))));
  assert.ok(emitted.length > 0);
  const bundle = Buffer.concat(emitted).toString('utf8');
  for (const secret of [accessKey, secretKey, sentinel]) assert.ok(!bundle.includes(secret), 'Backend secrets must not enter browser output');
  // Unit-test titles and test-support helpers identify test code if it were ever bundled.
  const webTests = readdirSync(join(root, 'apps/web/src'), { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.test.ts'));
  assert.ok(webTests.length > 0);
  for (const file of webTests) {
    const titles = [...(await readFile(join(root, 'apps/web/src', file), 'utf8')).matchAll(/^test\('([^']+)'/gm)].map(match => match[1]!);
    for (const title of titles) assert.ok(!bundle.includes(title), `Test code bundled: ${file}`);
  }
  for (const marker of ['createNativeConversation', 'buildServerComposition', 'isolatedObjectStorage']) assert.ok(!bundle.includes(marker), `Test helper bundled: ${marker}`);
  await fixture.noNetwork();
});
