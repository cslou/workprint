import { currentIntent, fenceKey } from './intent.js';

export type ExitNotice = { confirmed: boolean; switchAccount: boolean; recoveryOutcome?: 'password-updated' | 'update-unconfirmed' | 'invalid-link' };

/** Purpose/feedback only, carried by the existing access fence; never a session or identity. */
export function readExitNotice(intent: string | null): ExitNotice | undefined {
  const raw = localStorage.getItem(fenceKey);
  if (!raw || !raw.startsWith('{')) return undefined;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!value || typeof value !== 'object' || !('intent' in value) || value.intent !== intent || !('confirmed' in value) || typeof value.confirmed !== 'boolean' || !('switchAccount' in value) || typeof value.switchAccount !== 'boolean') return undefined;
  const outcome = 'recoveryOutcome' in value ? value.recoveryOutcome : undefined;
  if (outcome !== undefined && outcome !== 'password-updated' && outcome !== 'update-unconfirmed' && outcome !== 'invalid-link') return undefined;
  return { confirmed: value.confirmed, switchAccount: value.switchAccount, ...(outcome ? { recoveryOutcome: outcome } : {}) };
}
export function saveExitNotice(intent: string | null, notice: ExitNotice) {
  if (!intent || intent !== currentIntent() || localStorage.getItem(fenceKey) === null) throw new Error('Account-exit feedback scope changed');
  localStorage.setItem(fenceKey, JSON.stringify({ intent, confirmed: notice.confirmed, switchAccount: notice.switchAccount, ...(notice.recoveryOutcome ? { recoveryOutcome: notice.recoveryOutcome } : {}) }));
}
