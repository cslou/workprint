import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
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
for (const directory of new Set([current, destination])) {
  if (!existsSync(directory)) continue;
  const owned = realpathSync(directory) === realpathSync(destination);
  for (const name of readdirSync(directory)) {
    if (name.endsWith('.sample')) continue;
    if (owned && ['pre-commit', 'pre-push'].includes(name)) continue;
    const source = join(directory, name);
    if (!statSync(source).isFile() || !(statSync(source).mode & 0o111)) continue;
    throw new Error(`Existing custom hook ${source}; remove or integrate it explicitly before activation`);
  }
}
git('config', '--local', 'core.hooksPath', '.githooks');
if (resolve(git('rev-parse', '--git-path', 'hooks')) !== destination) throw new Error('Repository hooks path is overridden; integrate the effective Git configuration explicitly');
console.info('Repository hooks active: quick before commit; standard before push.');
