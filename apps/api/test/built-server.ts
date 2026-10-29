import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { command } from './process.js';
import { root } from './environment.js';

/** Compile production sources in isolation; only the optional launcher is test-owned. */
export async function buildServerComposition(logs: string, name: string, composition: ((directory: string) => string) | undefined, env: NodeJS.ProcessEnv) {
  const project = join(logs, name);
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), await readFile(join(root, 'apps/api/package.json')));
  await symlink(join(root, 'apps/api/node_modules'), join(project, 'node_modules'), 'dir');
  await command('pnpm', ['exec', 'tsc', '-p', 'apps/api/tsconfig.build.json', '--outDir', project], {
    cwd: root, env, log: join(logs, `${name}-build.log`), timeout: 60000,
  });
  if (!composition) return join(project, 'src/mastra/server.js');
  const entry = join(project, 'entry.mjs');
  await writeFile(entry, `${composition(join(project, 'src'))}
    import { startServer } from './src/mastra/server.js';
    await startServer(mastra, typeof beforeMastra === 'undefined' ? [] : beforeMastra);
  `);
  return entry;
}
