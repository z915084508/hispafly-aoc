export const SIMBRIEF_TOKEN_EXPIRY_MARGIN_MS = 60_000;

export function navigraphTokenNeedsRefresh(expiresAt: Date, now = Date.now()) {
  return expiresAt.getTime() <= now + SIMBRIEF_TOKEN_EXPIRY_MARGIN_MS;
}

