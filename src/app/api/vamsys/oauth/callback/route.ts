import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { exchangeVamsysAuthorizationCode, fetchVamsysProfile, fetchVamsysUser } from "@/lib/vamsys/client";
import { getVamsysPilotConfig } from "@/lib/vamsys/config";
import { mapVamsysPilot } from "@/lib/vamsys/pilotMapper";
import { secureStateEquals } from "@/lib/vamsys/pkce";

function finish(request: NextRequest, type: "success" | "error", message: string) {
  const url = new URL("/pilot", request.url);
  url.searchParams.set(type, message);
  const response = NextResponse.redirect(url);
  response.cookies.set("hispafly_vamsys_oauth_state", "", { httpOnly: true, path: "/api/vamsys/oauth", maxAge: 0 });
  response.cookies.set("hispafly_vamsys_code_verifier", "", { httpOnly: true, path: "/api/vamsys/oauth", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const providerError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("hispafly_vamsys_oauth_state")?.value;
  const codeVerifier = request.cookies.get("hispafly_vamsys_code_verifier")?.value;

  try {
    if (providerError) throw new Error(`vAMSYS rechazó la autorización: ${providerError}`);
    if (!code || !state || !expectedState || !codeVerifier || !secureStateEquals(expectedState, state)) {
      throw new Error("La validación de seguridad OAuth ha fallado. Inicia la conexión de nuevo.");
    }

    const config = getVamsysPilotConfig();
    const token = await exchangeVamsysAuthorizationCode(code, codeVerifier);
    if (!token.refresh_token) throw new Error("vAMSYS no devolvió un refresh token.");
    const refreshToken = token.refresh_token;
    const [user, profile] = await Promise.all([fetchVamsysUser(token.access_token), fetchVamsysProfile(token.access_token)]);
    const imported = mapVamsysPilot(user, profile);

    const pilot = await prisma.$transaction(async (tx) => {
      const existing = await tx.pilot.findFirst({ where: { OR: [
        { vamsysPilotId: imported.vamsysPilotId },
        ...(imported.vamsysUserId ? [{ vamsysUserId: imported.vamsysUserId }] : []),
        ...(imported.email ? [{ email: imported.email }] : []),
      ] } });
      const pilotData = {
        ...imported,
        rank: imported.rankName,
        status: "active" as const,
      };
      const saved = existing
        ? await tx.pilot.update({ where: { id: existing.id }, data: pilotData })
        : await tx.pilot.create({ data: pilotData });
      await tx.vamsysOAuthToken.upsert({
        where: { pilotId: saved.id },
        update: {
          accessToken: token.access_token, refreshToken,
          expiresAt: new Date(Date.now() + token.expires_in * 1000), scopes: token.scope ?? config.scopes, revokedAt: null,
        },
        create: {
          pilotId: saved.id, accessToken: token.access_token, refreshToken,
          expiresAt: new Date(Date.now() + token.expires_in * 1000), scopes: token.scope ?? config.scopes,
        },
      });
      await tx.aocAuditLog.create({ data: {
        action: "VAMSYS_OAUTH_CONNECTED", entityType: "Pilot", entityId: saved.id,
        message: `El piloto ${saved.callsign ?? saved.displayName} conectó su cuenta de vAMSYS.`,
        metadata: { vamsysPilotId: imported.vamsysPilotId, scopes: token.scope ?? config.scopes },
      } });
      return saved;
    });

    return finish(request, "success", `Cuenta vAMSYS conectada para ${pilot.displayName}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la conexión OAuth.";
    await writeAuditLogSafely({
      action: "VAMSYS_OAUTH_FAILED", entityType: "VamsysOAuth",
      message: "Falló un intento de conexión OAuth con vAMSYS.", metadata: { phase: "callback", reason: message.slice(0, 180) },
    });
    return finish(request, "error", message);
  }
}
