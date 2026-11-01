import { spawnSync } from 'node:child_process';

// Dependency audit for the regression gate: high and critical advisories fail; lower ones are listed and reported as a
// NOTICE, because they stay a reported non-pass rather than a silent pass (docs/regression-gates.md).
const result = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (result.error) throw result.error;
let report;
try { report = JSON.parse(result.stdout); } catch (error) {
  throw new Error(`pnpm audit returned no readable report (exit ${result.status}): ${result.stderr.trim()}`, { cause: error });
}
const counts = report.metadata?.vulnerabilities;
if (!counts || typeof counts.high !== 'number' || typeof counts.critical !== 'number') throw new Error('pnpm audit report has no severity counts');
for (const advisory of Object.values(report.advisories ?? {})) console.log(`${advisory.severity} ${advisory.module_name}: ${advisory.title} ${advisory.url}`);
const below = ['moderate', 'low', 'info'].filter(level => counts[level] > 0).map(level => `${counts[level]} ${level}`);
if (below.length) console.log(`NOTICE: dependency audit has advisories below the blocking threshold (${below.join(', ')}); report them as non-pass`);
const blocking = counts.high + counts.critical;
if (blocking) {
  console.error(`Dependency audit: ${counts.critical} critical and ${counts.high} high advisories`);
  process.exit(1);
}
