import { applicationResponseBytes } from '@workprint/contracts';
import { ArtifactError } from './errors.js';

/** Reserve the full bounded ASCII cursor before emitting any item. */
export function boundedPage<R, T>(rows: readonly R[], limit: number, project: (row: R) => T, cursor: (last: R) => string): { items: T[]; nextCursor: string | null } {
  const items: T[] = [];
  let bytes = Buffer.byteLength(JSON.stringify({ items: [], nextCursor: '' })) + 1000;
  for (const row of rows.slice(0, limit)) {
    const item = project(row);
    const size = Buffer.byteLength(JSON.stringify(item)) + (items.length ? 1 : 0);
    if (bytes + size > applicationResponseBytes) break;
    items.push(item); bytes += size;
  }
  if (rows.length && !items.length) throw new ArtifactError('integration_failure');
  const nextCursor = rows.length > items.length ? cursor(rows[items.length - 1]!) : null;
  if (nextCursor && (nextCursor.length > 1000 || !/^[A-Za-z0-9_.-]+$/.test(nextCursor))) throw new ArtifactError('integration_failure');
  return { items, nextCursor };
}
