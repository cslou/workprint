import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { environment, root } from './environment.js';
import { start } from './process.js';

const exec = promisify(execFile);

async function existingOwner(docker: string, id: string) {
  try {
    return (await exec(docker, ['inspect', '--format', '{{index .Config.Labels "workprint.fixture"}}', id])).stdout.trim();
  } catch (error) {
    if (/No such/.test(String(error))) return undefined;
    throw error;
  }
}

test('ambiguous Docker acquisition cleans only its owned container and preserves ownership-refusal errors', { timeout: 180000 }, async (t) => {
  const realDocker = (await exec('which', ['docker'])).stdout.trim();
  for (const scenario of [
    { started: false, mismatch: false, removeRace: false },
    { started: false, mismatch: true, removeRace: false },
    { started: true, mismatch: false, removeRace: false },
    { started: true, mismatch: true, removeRace: false },
    { started: false, mismatch: false, removeRace: true },
  ]) {
    const { started, mismatch, removeRace } = scenario;
    const fixture = await environment();
    const bin = join(fixture.logs, 'bin');
    const identityFile = join(fixture.logs, 'identity.json');
    const operations = join(fixture.logs, 'operations.log');
    const wrongOwner = randomUUID();
    await mkdir(bin);
    await writeFile(operations, '');
    await writeFile(join(bin, 'docker'), `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(operations)}, args[0] + '\\n');
const acquisition = args[0] === 'run';
const expectedOwner = args[args.indexOf('--label') + 1]?.split('=')[1];
if (acquisition && ${mismatch}) args[args.indexOf('--label') + 1] = 'workprint.fixture=${wrongOwner}';
if (acquisition && !${started}) { args[0] = 'create'; args.splice(args.indexOf('--detach'), 1); }
if (args[0] === 'rm' && ${removeRace}) {
  const removed = spawnSync(${JSON.stringify(realDocker)}, args, { encoding: 'utf8', timeout: 30000 });
  if (removed.status !== 0) { process.stderr.write(removed.stderr); process.exit(1); }
  appendFileSync(${JSON.stringify(operations)}, 'race-remove\\n');
}
const result = spawnSync(${JSON.stringify(realDocker)}, args, { encoding: 'utf8', timeout: 60000 });
if (result.status !== 0) { process.stderr.write(result.stderr ?? 'docker failed'); process.exit(1); }
if (acquisition) {
  const identity = { id: result.stdout.trim(), owner: ${mismatch} ? '${wrongOwner}' : expectedOwner };
  writeFileSync(${JSON.stringify(identityFile)}, JSON.stringify(identity));
  const state = spawnSync(${JSON.stringify(realDocker)}, ['inspect', '--format', '{{.State.Status}}', identity.id], { encoding: 'utf8', timeout: 30000 });
  if (state.status !== 0) { process.stderr.write(state.stderr); process.exit(1); }
  writeFileSync(${JSON.stringify(identityFile)}, JSON.stringify({ ...identity, state: state.stdout.trim() }));
  console.error('Synthetic lost acquisition response');
  process.exit(19);
}
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
`, { mode: 0o755 });
    const log = join(fixture.logs, 'acquisition.log');
    const child = await start(process.execPath, ['--input-type=module', '-e', `import { isolatedPostgres } from ${JSON.stringify(new URL('./postgres.js', import.meta.url).href)}; await isolatedPostgres();`], {
      cwd: root, env: { ...fixture.env, PATH: `${bin}:${fixture.env.PATH}` }, log,
    });
    let identity: { id: string; owner: string; state: string } | undefined;
    try {
      assert.notEqual(await child.exited, 0);
      identity = JSON.parse(await readFile(identityFile, 'utf8')) as typeof identity;
      assert.ok(identity);
      assert.equal(identity.state, started ? 'running' : 'created', 'The injected failure follows actual Docker acquisition');
      const failure = await readFile(log, 'utf8');
      assert.match(failure, /Synthetic lost acquisition response/, 'Primary acquisition error is retained');
      if (mismatch) {
        assert.match(failure, /ownership mismatch/, 'Cleanup refusal is also retained');
        assert.doesNotMatch(await readFile(operations, 'utf8'), /^(stop|rm)$/m);
        const actual = (await exec(realDocker, ['inspect', '--format', '{{index .Config.Labels "workprint.fixture"}}', identity.id])).stdout.trim();
        assert.equal(actual, wrongOwner);
      } else {
        assert.doesNotMatch(failure, /owned cleanup failed/, 'Expected removal races do not become cleanup failures');
        await assert.rejects(exec(realDocker, ['inspect', identity.id]), /No such/);
        const recorded = await readFile(operations, 'utf8');
        assert.match(recorded, started ? /^stop$/m : /^rm$/m);
        if (removeRace) assert.match(recorded, /^race-remove$/m);
      }
    } finally {
      await child.stop();
      // Only the test's recorded ID and actual owner may be used for fallback cleanup.
      identity ??= JSON.parse(await readFile(identityFile, 'utf8')) as typeof identity;
      assert.ok(identity);
      const label = await existingOwner(realDocker, identity.id);
      if (label !== undefined) {
        assert.equal(label, identity.owner, 'Refuse fallback cleanup of a different owner');
        await exec(realDocker, ['rm', '--force', '--volumes', identity.id]);
      }
    }
    await fixture.noNetwork();
    t.diagnostic(`Evidence: ${fixture.logs}`);
  }
});
