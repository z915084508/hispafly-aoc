import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { refreshVamsysToken, VamsysApiError } from "./client";

const EXPIRY_MARGIN_MS = 60_000;

export async function getValidVamsysAccessToken(pilotId: string): Promise<string> {
  const stored = await prisma.vamsysOAuthToken.findUnique({ where: { pilotId }, include: { pilot: true } });
  if (!stored) throw new Error("El piloto no ha conectado su cuenta de vAMSYS.");
  if (stored.revokedAt) throw new Error("La conexión de vAMSYS está revocada.");
  if (stored.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) return stored.accessToken;

  try {
    const refreshed = await refreshVamsysToken(stored.refreshToken);
    const accessToken = refreshed.access_token;
    await prisma.vamsysOAuthToken.update({
      where: { pilotId },
      data: {
        accessToken,
        refreshToken: refreshed.refresh_token ?? stored.refreshToken,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        scopes: refreshed.scope ?? stored.scopes,
        revokedAt: null,
      },
    });
    await writeAuditLogSafely({
      action: "VAMSYS_TOKEN_REFRESHED", entityType: "Pilot", entityId: pilotId,
      message: `Se renovó el token de vAMSYS del piloto ${stored.pilot.callsign ?? stored.pilot.displayName}.`,
      metadata: { pilotId },
    });
    return accessToken;
  } catch (error) {
    const invalidGrant = error instanceof VamsysApiError && error.code === "invalid_grant";
    if (invalidGrant) {
      await prisma.vamsysOAuthToken.update({ where: { pilotId }, data: { revokedAt: new Date() } });
      await writeAuditLogSafely({
        action: "VAMSYS_TOKEN_REVOKED", entityType: "Pilot", entityId: pilotId,
        message: `vAMSYS revocó la conexión del piloto ${stored.pilot.callsign ?? stored.pilot.displayName}.`,
        metadata: { pilotId, reason: "invalid_grant" },
      });
    }
    await writeAuditLogSafely({
      action: "VAMSYS_OAUTH_FAILED", entityType: "Pilot", entityId: pilotId,
      message: `No se pudo renovar la conexión de vAMSYS del piloto ${stored.pilot.callsign ?? stored.pilot.displayName}.`,
      metadata: { pilotId, phase: "refresh", revoked: invalidGrant },
    });
    throw new Error(invalidGrant ? "La conexión de vAMSYS fue revocada; el piloto debe conectarla de nuevo." : "No se pudo renovar el token de vAMSYS.");
  }
}
