import { spawnSync } from 'node:child_process';

// Preserve visibility of lower-severity advisories while blocking high/critical findings.
// pnpm's --audit-level also filters printed advisories, so inspect its full JSON report instead.
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
if (below.length) console.log(`Dependency audit is not clean: ${below.join(', ')} below the blocking threshold`);
const blocking = counts.high + counts.critical;
if (blocking) {
  console.error(`Dependency audit: ${counts.critical} critical and ${counts.high} high advisories`);
  process.exit(1);
}
