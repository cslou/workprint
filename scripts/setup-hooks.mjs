import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const root = git('rev-parse', '--show-toplevel');
process.chdir(root);
// core.hooksPath is shared by linked worktrees unless worktree config is enabled.
// Do not silently change any sibling's behavior, even from the primary checkout.
if (git('worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).length !== 1 ||
    git('rev-parse', '--absolute-git-dir') !== resolve(git('rev-parse', '--git-common-dir'))) {
  throw new Error('Hook activation requires a standalone clone; preserve linked-worktree configuration and integrate explicitly');
}
if (git('config', '--show-scope', '--list').split('\n').some(line => /^worktree\s+core\.hookspath=/i.test(line))) {
  throw new Error('Existing worktree-scoped hooks path; integrate it explicitly before activation');
}
const destination = join(root, '.githooks');
for (const name of ['pre-commit', 'pre-push']) accessSync(join(destination, name), constants.X_OK);
const current = resolve(git('rev-parse', '--git-path', 'hooks'));
const forwards = [];
if (existsSync(current) && realpathSync(current) !== realpathSync(destination)) {
  for (const name of readdirSync(current)) {
    if (name.endsWith('.sample')) continue;
    const source = join(current, name);
    if (!statSync(source).isFile() || !(statSync(source).mode & 0o111)) continue;
    if (name === 'pre-commit' || name === 'pre-push') throw new Error(`Existing ${name} in ${current}; integrate it explicitly before activation`);
    const target = join(destination, name);
    if (realpathSync(source).startsWith(`${realpathSync(destination)}/`)) throw new Error(`Existing hook forwards into repository hooks: ${source}`);
    // Invoke the original pathname so hooks can still load adjacent support files.
    const wrapper = `#!/bin/sh\nexec '${source.replaceAll("'", "'\"'\"'")}' "$@"\n`;
    // Check every conflict before writing any wrapper or configuration.
    try {
      if (!lstatSync(target).isFile() || readFileSync(target, 'utf8') !== wrapper) throw new Error(`Existing hook destination conflicts: ${target}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      forwards.push({ wrapper, target });
    }
  }
}
for (const { wrapper, target } of forwards) writeFileSync(target, wrapper, { mode: 0o755, flag: 'wx' });
git('config', '--local', 'core.hooksPath', '.githooks');
if (resolve(git('rev-parse', '--git-path', 'hooks')) !== destination) throw new Error('Repository hooks path is overridden; integrate the effective Git configuration explicitly');
console.info('Repository hooks active: quick before commit; standard before push. Existing custom hooks retained as ignored local wrappers.');
