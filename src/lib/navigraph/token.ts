import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { NavigraphOAuthError, refreshNavigraphToken } from "./client";

const EXPIRY_MARGIN_MS = 60_000;

export async function assertNavigraphConnected(pilotId: string) {
  const token = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId }, select: { revokedAt: true } });
  if (!token || token.revokedAt) throw new Error("You must connect Navigraph / SimBrief before preparing an OFP.");
}

export async function getValidNavigraphAccessToken(pilotId: string): Promise<string> {
  const stored = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId }, include: { pilot: true } });
  if (!stored || stored.revokedAt) throw new Error("You must connect Navigraph / SimBrief before preparing an OFP.");
  if (stored.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) return stored.accessToken;
  try {
    const token = await refreshNavigraphToken(stored.refreshToken);
    const accessToken = token.access_token;
    await prisma.navigraphOAuthToken.update({ where: { pilotId }, data: {
      accessToken,
      refreshToken: token.refresh_token ?? stored.refreshToken,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope ?? stored.scopes,
      revokedAt: null,
    } });
    await writeAuditLogSafely({ action: "NAVIGRAPH_TOKEN_REFRESHED", entityType: "Pilot", entityId: pilotId, message: "Navigraph OAuth token refreshed.", metadata: { pilotId } });
    return accessToken;
  } catch (error) {
    const revoked = error instanceof NavigraphOAuthError && error.code === "invalid_grant";
    if (revoked) await prisma.navigraphOAuthToken.update({ where: { pilotId }, data: { revokedAt: new Date() } });
    await writeAuditLogSafely({ action: "NAVIGRAPH_TOKEN_REFRESH_FAILED", entityType: "Pilot", entityId: pilotId, message: "Navigraph OAuth token refresh failed.", metadata: { pilotId, revoked } });
    throw new Error(revoked ? "Navigraph authorization was revoked. Reconnect Navigraph / SimBrief." : "Could not refresh Navigraph authorization.");
  }
}
