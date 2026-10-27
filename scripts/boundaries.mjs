import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const inputs = [...globSync('apps/*/src'), ...globSync('apps/*/test'), ...globSync('packages/*/src'), 'scripts'];
const result = spawnSync('depcruise', ['--config', '.dependency-cruiser.cjs', ...inputs], { stdio: 'inherit' });
process.exit(result.status ?? 1);
