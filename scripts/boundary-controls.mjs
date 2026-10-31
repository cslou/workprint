import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const api = 'apps/api/src/';
const pairs = [
  ['application-no-native', `${api}application`, `${api}agent`],
  ['application-no-native', `${api}application`, `${api}agent/mastra`],
  ['application-no-native', `${api}application`, `${api}mastra`],
  ['application-no-native', `${api}application`, `${api}bootstrap`],
  ['mechanics-no-upward', `${api}db`, `${api}application`],
  ['db-public-interface', `${api}mastra`, `${api}db`],
  ['generation-no-peers', `${api}generation`, `${api}artifacts`],
  ['browser-no-server', 'apps/web/src', `${api}db`],
  ['web-materials-uploads-no-media', 'apps/web/src/materials', 'apps/web/src/media'],
  ['web-materials-uploads-no-media', 'apps/web/src/uploads', 'apps/web/src/media'],
  ['web-shared-no-features', 'apps/web/src/ui', 'apps/web/src/media'],
  ['web-shared-no-features', 'apps/web/src/api', 'apps/web/src/uploads'],
  ['packages-no-apps', 'packages/contracts/src', `${api}db`],
  ['production-no-tests', `${api}mastra`, 'apps/api/test'],
  ['player-only-web-consumer', `${api}db`, 'packages/player/src'],
];

function probe(rule, files) {
  const created = [];
  const directories = [];
  const ensureDirectory = (path) => {
    if (existsSync(path)) return;
    ensureDirectory(dirname(path));
    mkdirSync(path);
    directories.push(path);
  };
  try {
    for (const [path, contents] of files) {
      ensureDirectory(dirname(path));
      writeFileSync(path, contents, { flag: 'wx' });
      created.push(path);
    }
    const result = spawnSync('depcruise', ['--config', '.dependency-cruiser.cjs', files[0][0]], { encoding: 'utf8', timeout: 30000 });
    assert.ok(result.status !== null && result.status > 0, `Control must be rejected: ${rule}; ${result.stderr}; ${result.stdout}`);
    assert.ok(result.stdout.includes(`error ${rule}:`), `Expected ${rule}, got ${result.stdout}`);
  } finally {
    for (const path of created.reverse()) unlinkSync(path);
    for (const path of directories.reverse()) rmdirSync(path);
  }
}

for (const [rule, sourceDir, targetDir] of pairs) {
  const source = `${sourceDir}/boundary-control-source.ts`;
  const target = `${targetDir}/boundary-control-target.ts`;
  const imported = relative(dirname(source), target).replaceAll('\\', '/');
  probe(rule, [[source, `import './${imported}';\n`], [target, 'export {};\n']]);
}
probe('browser-no-node', [['apps/web/src/boundary-control-node.ts', "import 'node:fs';\n"]]);
probe('no-cycles', [
  [`${api}db/boundary-control-a.ts`, "import './boundary-control-b.ts';\n"],
  [`${api}db/boundary-control-b.ts`, "import './boundary-control-a.ts';\n"],
]);
console.info('Boundary controls: all forbidden imports rejected by intended rules; controls removed');
