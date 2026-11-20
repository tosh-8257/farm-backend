/** Codes that mean the refresh session itself is dead. A 403 never uses these. */
export const TERMINAL_SESSION_CODES = new Set([
  'session_revoked',
  'token_revoked',
  'session_expired',
  'refresh_reuse',
]);

export function isTerminalSessionMessage(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes('already in progress') ||
    lower.includes('retry with the latest')
  )
    return false;
  if (lower.includes('device id') && lower.includes('refresh')) return false;
  return (
    lower.includes('revoked') ||
    lower.includes('compromised') ||
    lower.includes('session not found') ||
    lower.includes('session expired') ||
    lower.includes('expired session') ||
    lower.includes('not valid on this device') ||
    lower.includes('session not valid')
  );
}

export function isTerminalSessionFailure(
  code: string | undefined,
  message: string,
) {
  const normalized = (code ?? '').toLowerCase().replace(/-/g, '_');
  if (normalized === 'device_id_required' || normalized === 'access_expired')
    return false;
  if (TERMINAL_SESSION_CODES.has(normalized)) return true;
  return isTerminalSessionMessage(message);
}
