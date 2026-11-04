import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { root } from '../support/environment.js';

test('hook activation refuses custom hooks and enforces native suites in a standalone clone', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workprint hooks-'));
  const repo = join(directory, 'repo'), remote = join(directory, 'remote.git'), custom = join(directory, "custom hook's");
  const env = { ...process.env, PATH: `${join(repo, 'bin')}:${process.env.PATH}`, GIT_CONFIG_GLOBAL: join(directory, 'global.config'), GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const run = (command: string, args: string[], cwd = repo, ok = true) => {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 5000 });
    if (ok) assert.equal(result.status, 0, result.stderr);
    else { assert.notEqual(result.status, null, String(result.error)); assert.notEqual(result.status, 0); }
    return result;
  };
  const activate = (ok = true) => run(process.execPath, [join(root, 'scripts/setup-hooks.mjs')], repo, ok);
  try {
    for (const path of [repo, custom, join(repo, '.githooks'), join(repo, 'bin'), join(repo, 'nested')]) await mkdir(path, { recursive: true });
    run('git', ['init', '-q']); run('git', ['init', '--bare', '-q', remote]);
    run('git', ['config', '--global', 'core.hooksPath', custom]);
    for (const name of ['pre-commit', 'pre-push']) await copyFile(join(root, '.githooks', name), join(repo, '.githooks', name));
    for (const name of ['pre-commit', 'pre-push']) await chmod(join(repo, '.githooks', name), 0o755);
    const customHook = '#!/bin/sh\nexit 0\n';
    await writeFile(join(custom, 'prepare-commit-msg'), customHook, { mode: 0o755 });
    assert.match(activate(false).stderr, /Existing custom hook/);
    assert.equal(await readFile(join(custom, 'prepare-commit-msg'), 'utf8'), customHook);
    assert.equal(run('git', ['config', '--get', 'core.hooksPath']).stdout.trim(), custom);
    await rm(join(custom, 'prepare-commit-msg'));
    await writeFile(join(repo, 'bin/pnpm'), '#!/bin/sh\nprintf "%s %s\\n" "$1" "$PWD" >> suites.log\ntest ! -e "fail-${1#verify:}"\n', { mode: 0o755 });
    activate(); activate();
    assert.equal(run('git', ['config', '--local', '--get', 'core.hooksPath']).stdout.trim(), '.githooks');
    assert.equal(run('git', ['config', '--global', '--get', 'core.hooksPath']).stdout.trim(), custom);
    await writeFile(join(repo, 'file'), 'one'); run('git', ['add', 'file']);
    run('git', ['commit', '-qm', 'first'], join(repo, 'nested'));
    const first = run('git', ['rev-parse', 'HEAD']).stdout;
    await writeFile(join(repo, 'fail-quick'), '');
    run('git', ['commit', '--allow-empty', '-qm', 'blocked'], repo, false);
    assert.equal(run('git', ['rev-parse', 'HEAD']).stdout, first);
    await rm(join(repo, 'fail-quick'));
    run('git', ['remote', 'add', 'origin', remote]);
    await writeFile(join(repo, 'fail-standard'), '');
    run('git', ['push', 'origin', 'HEAD:refs/heads/candidate'], repo, false);
    assert.equal(run('git', ['--git-dir', remote, 'show-ref'], repo, false).stdout, '');
    await rm(join(repo, 'fail-standard'));
    const pushed = run('git', ['push', 'origin', 'HEAD:refs/heads/candidate'], join(repo, 'nested'));
    assert.ok(pushed.stderr.includes('Review reminder: if this change has not completed the review workflow,\nfollow the review skill, including its round limit and stopping rules.\nDo not repeat a completed, still-applicable review.'));
    assert.equal(run('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/candidate']).stdout, first);
    const lines = (await readFile(join(repo, 'suites.log'), 'utf8')).trim().split('\n');
    assert.deepEqual(lines, ['quick', 'quick', 'standard', 'standard'].map(tier => `verify:${tier} ${repo}`));
    // Existing hooks require explicit integration, with no local config switch.
    run('git', ['config', '--local', '--unset', 'core.hooksPath']);
    // A single primary worktree may still have higher-precedence hook configuration.
    run('git', ['config', 'extensions.worktreeConfig', 'true']);
    run('git', ['config', '--worktree', 'core.hooksPath', custom]);
    assert.match(activate(false).stderr, /worktree-scoped hooks path/);
    run('git', ['config', '--local', '--get', 'core.hooksPath'], repo, false);
    assert.equal(run('git', ['config', '--get', 'core.hooksPath']).stdout.trim(), custom);
    run('git', ['config', '--worktree', '--unset', 'core.hooksPath']);
    run('git', ['config', '--unset', 'extensions.worktreeConfig']);
    await writeFile(join(custom, 'pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.match(activate(false).stderr, /Existing custom hook/);
    assert.equal(run('git', ['config', '--get', 'core.hooksPath']).stdout.trim(), custom);
    await rm(join(custom, 'pre-commit'));
    // A legacy wrapper in the destination is neither activated nor silently deleted.
    await writeFile(join(repo, '.githooks/prepare-commit-msg'), customHook, { mode: 0o755 });
    assert.match(activate(false).stderr, /Existing custom hook/);
    assert.equal(await readFile(join(repo, '.githooks/prepare-commit-msg'), 'utf8'), customHook);
    await rm(join(repo, '.githooks/prepare-commit-msg'));
    run('git', ['worktree', 'add', '--detach', join(directory, 'linked'), 'HEAD']);
    assert.match(activate(false).stderr, /standalone clone/);
    assert.match(run(process.execPath, [join(root, 'scripts/setup-hooks.mjs')], join(directory, 'linked'), false).stderr, /standalone clone/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('verification rebuilds fresh tests, blocks failures and allows a corrected rerun without approval state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workprint verify-'));
  try {
    await mkdir(join(directory, 'scripts'));
    await mkdir(join(directory, 'bin'));
    await copyFile(join(root, 'scripts/verify.mjs'), join(directory, 'scripts/verify.mjs'));
    await writeFile(join(directory, 'bin/pnpm'), `#!/bin/sh
set -eu
if [ "$1" = check ]; then
  test -z "\${WORKPRINT_TESTS_COMPILED:-}"
else
  test "\${WORKPRINT_TESTS_COMPILED:-}" = 1
fi
test ! -e "fail-$1"
touch "$1.passed"
`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${join(directory, 'bin')}:${process.env.PATH}`, WORKPRINT_TESTS_COMPILED: '1' };
    const run = () => spawnSync(process.execPath, [join(directory, 'scripts/verify.mjs'), 'standard'], { env, encoding: 'utf8', timeout: 10000 });
    await writeFile(join(directory, 'fail-test:unit'), '');
    const failed = run();
    assert.equal(failed.status, 1, failed.stderr);
    await assert.rejects(readFile(join(directory, 'build.passed')), { code: 'ENOENT' });
    await rm(join(directory, 'fail-test:unit'));
    const passed = run();
    assert.equal(passed.status, 0, passed.stderr);
    await readFile(join(directory, 'check.passed'));
    await readFile(join(directory, 'test:unit.passed'));
    await readFile(join(directory, 'build.passed'));
    await readFile(join(directory, 'test:tooling.passed'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('verification interrupts cleanly when a child exits zero or a build owns a detached compiler', { timeout: 15000 }, async () => {
  for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
    const directory = await mkdtemp(join(tmpdir(), 'workprint-verify-signal-'));
    let compilerPid = 0;
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await mkdir(join(directory, 'scripts'));
      await mkdir(join(directory, 'bin'));
      await copyFile(join(root, 'scripts/verify.mjs'), join(directory, 'scripts/verify.mjs'));
      await writeFile(join(directory, 'bin/tsc'), `#!${process.execPath}
const { writeFileSync } = require('node:fs');
process.on('SIGTERM', () => { writeFileSync('cleaned', 'yes'); process.exit(0); });
setTimeout(() => process.exit(9), 10000).unref();
console.log('COMPILER_READY:' + process.pid);
setInterval(() => {}, 1000);
`, { mode: 0o755 });
      await writeFile(join(directory, 'bin/pnpm'), `#!/bin/sh
set -eu
case "$1" in
  check) ${signal === 'SIGTERM' ? 'exec tsc' : 'exit 0'} ;;
  test:unit) exit 0 ;;
  build) exec '${process.execPath}' '${join(root, 'scripts/tasks.mjs')}' build ;;
  *) touch later-stage ;;
esac
`, { mode: 0o755 });
      child = spawn(process.execPath, [join(directory, 'scripts/verify.mjs'), 'standard'], {
        env: { ...process.env, PATH: `${join(directory, 'bin')}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const exited = new Promise<number | null>((resolve, reject) => { child!.once('exit', resolve); child!.once('error', reject); });
      let output = '';
      child.stderr!.on('data', data => { output += data; });
      const ready = new Promise<void>(resolve => child!.stdout!.on('data', data => {
        output += data;
        const match = /COMPILER_READY:(\d+)/.exec(output);
        if (match) { compilerPid = Number(match[1]); resolve(); }
      }));
      await Promise.race([ready, exited.then(() => { throw new Error(`Verifier exited before compiler readiness: ${output}`); })]);
      child.kill(signal);
      assert.equal(await exited, 1, output);
      assert.equal(await readFile(join(directory, 'cleaned'), 'utf8'), 'yes');
      assert.throws(() => process.kill(compilerPid, 0), { code: 'ESRCH' });
      await assert.rejects(readFile(join(directory, 'later-stage')), { code: 'ENOENT' });
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      if (compilerPid) {
        try { process.kill(compilerPid, 'SIGKILL'); }
        catch (error) { assert.equal((error as NodeJS.ErrnoException).code, 'ESRCH'); }
      }
      await rm(directory, { recursive: true, force: true });
    }
  }
});
