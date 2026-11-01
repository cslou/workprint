import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, sep } from 'node:path';
import { test } from 'node:test';
import { environment, root, sentinel } from '../support/environment.js';
import { command } from '../support/process.js';

const accessKey = 'private-storage-build-sentinel-access', secretKey = 'private-storage-build-sentinel-secret';

test('the production web bundle contains no test code or backend secrets', { timeout: 120000 }, async () => {
  const fixture = await environment();
  const output = join(fixture.logs, 'web-dist');
  const inputsFile = join(fixture.logs, 'build-inputs.json');
  // The production config, plus a plugin that only records which modules became build inputs.
  await command(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'vite';
    import { writeFileSync } from 'node:fs';
    await build({ build: { outDir: ${JSON.stringify(output)} }, plugins: [{ name: 'record-production-inputs', generateBundle() {
      writeFileSync(${JSON.stringify(inputsFile)}, JSON.stringify([...this.getModuleIds()]));
    } }] });
  `], { cwd: join(root, 'apps/web'), env: { ...fixture.env, S3_ACCESS_KEY_ID: accessKey, S3_SECRET_ACCESS_KEY: secretKey }, log: join(fixture.logs, 'web-build.log') });
  const inputs = (JSON.parse(await readFile(inputsFile, 'utf8')) as string[]).filter(id => isAbsolute(id) && !id.includes('\0')).map(id => id.split('?')[0]!);
  assert.ok(inputs.length > 0);
  const allowed = [join(root, 'apps/web/src') + sep, join(root, 'apps/web/index.html'), ...['api-client', 'contracts', 'player'].map(name => join(root, 'packages', name, 'dist') + sep)];
  for (const input of inputs) {
    const path = await realpath(input);
    const dependency = path.split(sep).includes('node_modules');
    assert.ok(dependency || allowed.some(prefix => path === prefix || path.startsWith(prefix)), `Unexpected build input: ${path}`);
    assert.ok(!/\.test\.[jt]sx?$/.test(path), `Test file bundled: ${path}`);
  }
  const emitted = await Promise.all(readdirSync(output, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => readFile(join(entry.parentPath, entry.name))));
  assert.ok(emitted.length > 0);
  const bundle = Buffer.concat(emitted).toString('utf8');
  for (const secret of [accessKey, secretKey, sentinel]) assert.ok(!bundle.includes(secret), 'Backend secrets must not enter browser output');
  // Web unit-test titles survive minification, so they identify test code if it were ever bundled.
  const webTests = readdirSync(join(root, 'apps/web/src'), { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.test.ts'));
  assert.ok(webTests.length > 0);
  for (const file of webTests) {
    const titles = [...(await readFile(join(root, 'apps/web/src', file), 'utf8')).matchAll(/^test\('([^']+)'/gm)].map(match => match[1]!);
    for (const title of titles) assert.ok(!bundle.includes(title), `Test code bundled: ${file}`);
  }
  await fixture.noNetwork();
});
