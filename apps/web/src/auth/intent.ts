export const fenceKey = 'workprint.auth-access-fenced';
export const intentKey = 'workprint.auth-intent';

/** Noncredential operation revision. SDK sessions/verifiers are never read or stored here. */
export function currentIntent(): string | null { return localStorage.getItem(intentKey); }
export function saveFence(): string {
  const nonce = crypto.randomUUID();
  localStorage.setItem(fenceKey, nonce);
  localStorage.setItem(intentKey, nonce);
  return nonce;
}
