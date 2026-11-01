const terminalCodes = new Set(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_not_found', 'user_banned']);

/** Classify only confirmed Auth rejection; outages/malformed replies cannot invalidate valid access. */
export async function terminalRefreshRejection(response: Response): Promise<boolean> {
  if (![400, 401, 403].includes(response.status)) return false;
  let value: unknown;
  try { value = await response.clone().json(); }
  catch { return false; } // An unqualified response is not evidence of terminal rejection.
  if (!value || typeof value !== 'object') return false;
  return ('code' in value && typeof value.code === 'string' && terminalCodes.has(value.code)) ||
    ('error_code' in value && typeof value.error_code === 'string' && terminalCodes.has(value.error_code)) ||
    ('error' in value && value.error === 'invalid_grant');
}
