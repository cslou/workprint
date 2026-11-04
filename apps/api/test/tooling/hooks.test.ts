import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { root } from '../support/environment.js';

test('hook activation preserves custom behavior and enforces commit/push gates in a standalone clone', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workprint hooks-'));
  const repo = join(directory, 'repo'), remote = join(directory, 'remote.git'), custom = join(directory, "custom hook's");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(directory, 'global.config'), GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const run = (command: string, args: string[], cwd = repo, ok = true) => {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 5000 });
    if (ok) assert.equal(result.status, 0, result.stderr);
    else { assert.notEqual(result.status, null, String(result.error)); assert.notEqual(result.status, 0); }
    return result;
  };
  const activate = (ok = true) => run(process.execPath, [join(root, 'scripts/setup-hooks.mjs')], repo, ok);
  try {
    for (const path of [repo, custom, join(repo, '.githooks'), join(repo, '.checks'), join(repo, 'nested')]) await mkdir(path, { recursive: true });
    run('git', ['init', '-q']); run('git', ['init', '--bare', '-q', remote]);
    run('git', ['config', '--global', 'core.hooksPath', custom]);
    for (const name of ['pre-commit', 'pre-push', '.gitignore']) await copyFile(join(root, '.githooks', name), join(repo, '.githooks', name));
    for (const name of ['pre-commit', 'pre-push']) await chmod(join(repo, '.githooks', name), 0o755);
    await writeFile(join(custom, 'hook-lib.sh'), 'printf x >> custom.log\n');
    await writeFile(join(custom, 'prepare-commit-msg'), '#!/bin/sh\n. "$(dirname "$0")/hook-lib.sh"\ntest -f "$1"\n', { mode: 0o755 });
    await writeFile(join(repo, '.checks/regression.sh'), '#!/bin/sh\nprintf "%s %s\\n" "$1" "$PWD" >> gate.log\ntest ! -e ".checks/fail-${1#--tier=}"\n', { mode: 0o755 });
    activate(); activate();
    assert.equal(run('git', ['config', '--local', '--get', 'core.hooksPath']).stdout.trim(), '.githooks');
    assert.equal(run('git', ['config', '--global', '--get', 'core.hooksPath']).stdout.trim(), custom);
    assert.match(run('git', ['check-ignore', '.githooks/prepare-commit-msg']).stdout, /prepare-commit-msg/);
    await writeFile(join(repo, 'file'), 'one'); run('git', ['add', 'file']);
    run('git', ['commit', '-qm', 'first'], join(repo, 'nested'));
    const first = run('git', ['rev-parse', 'HEAD']).stdout;
    assert.equal(await readFile(join(repo, 'custom.log'), 'utf8'), 'x');
    await writeFile(join(repo, '.checks/fail-quick'), '');
    run('git', ['commit', '--allow-empty', '-qm', 'blocked'], repo, false);
    assert.equal(run('git', ['rev-parse', 'HEAD']).stdout, first);
    assert.equal(await readFile(join(repo, 'custom.log'), 'utf8'), 'x');
    await rm(join(repo, '.checks/fail-quick'));
    run('git', ['remote', 'add', 'origin', remote]);
    await writeFile(join(repo, '.checks/fail-standard'), '');
    run('git', ['push', 'origin', 'HEAD:refs/heads/candidate'], repo, false);
    assert.equal(run('git', ['--git-dir', remote, 'show-ref'], repo, false).stdout, '');
    await rm(join(repo, '.checks/fail-standard'));
    const pushed = run('git', ['push', 'origin', 'HEAD:refs/heads/candidate'], join(repo, 'nested'));
    assert.ok(pushed.stderr.includes('Review reminder: if this change has not completed the review workflow,\nfollow the review skill, including its round limit and stopping rules.\nDo not repeat a completed, still-applicable review.'));
    assert.equal(run('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/candidate']).stdout, first);
    const lines = (await readFile(join(repo, 'gate.log'), 'utf8')).trim().split('\n');
    assert.deepEqual(lines, ['quick', 'quick', 'standard', 'standard'].map(tier => `--tier=${tier} ${repo}`));
    // Existing gate hooks require explicit integration, with no local config switch.
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
    assert.match(activate(false).stderr, /Existing pre-commit/);
    assert.equal(run('git', ['config', '--get', 'core.hooksPath']).stdout.trim(), custom);
    await rm(join(custom, 'pre-commit'));
    // An ignored custom destination is not overwritten either.
    await rm(join(repo, '.githooks/prepare-commit-msg'));
    await writeFile(join(repo, '.githooks/prepare-commit-msg'), 'keep me');
    assert.match(activate(false).stderr, /destination conflicts/);
    assert.equal(await readFile(join(repo, '.githooks/prepare-commit-msg'), 'utf8'), 'keep me');
    run('git', ['worktree', 'add', '--detach', join(directory, 'linked'), 'HEAD']);
    assert.match(activate(false).stderr, /standalone clone/);
    assert.match(run(process.execPath, [join(root, 'scripts/setup-hooks.mjs')], join(directory, 'linked'), false).stderr, /standalone clone/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
