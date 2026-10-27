import { spawnSync } from 'node:child_process';

export function compileTests() {
  for (const project of ['packages/api-client/tsconfig.json', 'apps/api/tsconfig.json']) {
    const result = spawnSync('tsc', ['-p', project], { stdio: 'inherit' });
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
