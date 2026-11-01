import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';

// Records, then compares, the test resources a regression-gate run could leave behind: workprint-* containers and
// networks, stack directories and the end-to-end preview port. It only reports; ownership of anything new must be
// confirmed before removal (see docs/regression-gates.md#incomplete-runs).
const [mode, file] = process.argv.slice(2);
if (!['baseline', 'verify'].includes(mode) || !file) throw new Error('Usage: node scripts/test-stack-leftovers.mjs baseline|verify <file>');

const docker = args => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.split('\n').filter(line => line.startsWith('workprint-')).sort() : null;
};
const portFree = port => new Promise(done => {
  const server = createServer();
  server.once('error', () => done(false));
  server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
});
const stacks = 'outputs/fixtures/stack';
const port = Number(process.env.WORKPRINT_PREVIEW_PORT ?? '4180');
const snapshot = {
  // Docker may be stopped for Docker-free tiers; null means nothing could have been created there.
  containers: docker(['ps', '-a', '--format', '{{.Names}}']),
  networks: docker(['network', 'ls', '--format', '{{.Name}}']),
  stacks: existsSync(stacks) ? readdirSync(stacks).sort() : [],
  port: { number: port, free: await portFree(port) },
};

if (mode === 'baseline') {
  writeFileSync(file, JSON.stringify(snapshot));
  process.exit(0);
}
const baseline = JSON.parse(readFileSync(file, 'utf8'));
const added = (before, after) => before === null || after === null ? [] : after.filter(name => !before.includes(name));
const leftovers = [
  ...added(baseline.containers, snapshot.containers).map(name => `container ${name}`),
  ...added(baseline.networks, snapshot.networks).map(name => `network ${name}`),
  ...added(baseline.stacks, snapshot.stacks).map(name => `stack directory ${stacks}/${name}`),
  ...(baseline.port.free && !snapshot.port.free ? [`listener on 127.0.0.1:${port}`] : []),
];
if (leftovers.length) {
  console.error(`Leftover test resources from this run:\n${leftovers.join('\n')}`);
  process.exit(1);
}
console.log('No leftover test resources');
