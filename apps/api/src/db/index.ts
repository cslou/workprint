export function databaseUrl(value: string | undefined, name: string): string {
  const fail = (): never => { throw new Error(`Invalid or missing server configuration: ${name}`); };
  if (!value) return fail();
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      !url.username || !url.password || url.pathname.length < 2) return fail();
    return value;
  } catch {
    return fail();
  }
}

export { transaction, assertRestrictedApplicationRole } from './transaction.js';
export { assertRestrictedRole, type ServingRolePolicy } from './privileges.js';
