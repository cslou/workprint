import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

// Records, then compares, what a regression-gate run could leave behind in this checkout. A test stack keeps its
// outputs/fixtures/stack/<owner> directory until every container, network and server it started is released, so a new
// directory means an incomplete stack cleanup. The preview port is host-wide, so it is compared only when the run
// started browser journeys. Reports only; confirm ownership before removing anything (docs/regression-gates.md).
const [mode] = process.argv.slice(2);
const run = process.env.CHECKS_RUN_DIR;
if (!['baseline', 'verify'].includes(mode) || !run) throw new Error('Usage: CHECKS_RUN_DIR=<run logs> node scripts/test-stack-leftovers.mjs baseline|verify');
const file = join(run, 'stack-baseline.json');

const portFree = port => new Promise(done => {
  const server = createServer();
  server.once('error', () => done(false));
  server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
});
const stacks = 'outputs/fixtures/stack';
const port = Number(process.env.WORKPRINT_PREVIEW_PORT ?? '4180');
const snapshot = { stacks: existsSync(stacks) ? readdirSync(stacks).sort() : [], portFree: await portFree(port) };

if (mode === 'baseline') {
  writeFileSync(file, JSON.stringify(snapshot), { flag: 'wx' });
  process.exit(0);
}
if (!existsSync(file)) throw new Error(`No baseline for this run at ${file}; leftovers cannot be checked`);
const baseline = JSON.parse(readFileSync(file, 'utf8'));
const browserJourneys = readdirSync(run).some(name => name.endsWith('-stack-suites.log'));
const leftovers = [
  ...snapshot.stacks.filter(name => !baseline.stacks.includes(name)).map(name => `stack directory ${stacks}/${name}`),
  ...(browserJourneys && baseline.portFree && !snapshot.portFree ? [`listener on 127.0.0.1:${port}`] : []),
];
if (leftovers.length) {
  console.error(`Leftover test resources from this run:\n${leftovers.join('\n')}`);
  process.exit(1);
}
console.log('No leftover test resources');
