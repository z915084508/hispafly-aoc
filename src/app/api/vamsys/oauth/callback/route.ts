import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { setPilotSession } from "@/lib/pilot/session";
import { exchangeVamsysAuthorizationCode, fetchVamsysProfile, fetchVamsysUser } from "@/lib/vamsys/client";
import { getVamsysPilotConfig } from "@/lib/vamsys/config";
import { mapVamsysPilot } from "@/lib/vamsys/pilotMapper";
import { secureStateEquals } from "@/lib/vamsys/pkce";

function finish(request: NextRequest, target: "/pilot" | "/pilot/dashboard", type?: "success" | "error", message?: string) {
  const url = new URL(target, request.url);
  if (type && message) url.searchParams.set(type, message);
  const response = NextResponse.redirect(url);
  response.cookies.set("hispafly_vamsys_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set("hispafly_vamsys_code_verifier", "", { httpOnly: true, path: "/", maxAge: 0 });
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
    if (providerError) throw new Error(`vAMSYS rejected authorization: ${providerError}`);
    if (!code || !state || !expectedState || !codeVerifier || !secureStateEquals(expectedState, state)) {
      throw new Error("OAuth security validation failed. Please start the vAMSYS login again.");
    }

    const config = getVamsysPilotConfig();
    const token = await exchangeVamsysAuthorizationCode(code, codeVerifier);
    if (!token.refresh_token) throw new Error("vAMSYS did not return a refresh token.");
    const refreshToken = token.refresh_token;
    const [user, profile] = await Promise.all([fetchVamsysUser(token.access_token), fetchVamsysProfile(token.access_token)]);
    const imported = mapVamsysPilot(user, profile);

    const pilot = await prisma.$transaction(async (tx) => {
      const existingByPilotId = await tx.pilot.findUnique({ where: { vamsysPilotId: imported.vamsysPilotId } });
      const existingByUserId = !existingByPilotId && imported.vamsysUserId
        ? await tx.pilot.findUnique({ where: { vamsysUserId: imported.vamsysUserId } })
        : null;
      const existingByEmail = !existingByPilotId && !existingByUserId && imported.email
        ? await tx.pilot.findUnique({ where: { email: imported.email } })
        : null;
      const existingByCallsign = !existingByPilotId && !existingByUserId && !existingByEmail && imported.callsign
        ? await tx.pilot.findUnique({ where: { callsign: imported.callsign } })
        : null;
      const existing = existingByPilotId ?? existingByUserId ?? existingByEmail ?? existingByCallsign;
      const userIdConflict = imported.vamsysUserId ? await tx.pilot.findUnique({ where: { vamsysUserId: imported.vamsysUserId } }) : null;
      const emailConflict = imported.email ? await tx.pilot.findUnique({ where: { email: imported.email } }) : null;
      const callsignConflict = imported.callsign ? await tx.pilot.findUnique({ where: { callsign: imported.callsign } }) : null;
      const pilotData = {
        ...imported,
        vamsysUserId: userIdConflict && userIdConflict.id !== existing?.id ? existing?.vamsysUserId ?? null : imported.vamsysUserId,
        email: emailConflict && emailConflict.id !== existing?.id ? existing?.email ?? null : imported.email,
        callsign: callsignConflict && callsignConflict.id !== existing?.id ? existing?.callsign ?? null : imported.callsign,
        rank: imported.rankName,
        status: "active" as const,
      };
      const saved = existing
        ? await tx.pilot.update({ where: { id: existing.id }, data: pilotData })
        : await tx.pilot.create({ data: pilotData });

      await tx.vamsysOAuthToken.upsert({
        where: { pilotId: saved.id },
        update: {
          accessToken: token.access_token,
          refreshToken,
          expiresAt: new Date(Date.now() + token.expires_in * 1000),
          scopes: token.scope ?? config.scopes,
          revokedAt: null,
        },
        create: {
          pilotId: saved.id,
          accessToken: token.access_token,
          refreshToken,
          expiresAt: new Date(Date.now() + token.expires_in * 1000),
          scopes: token.scope ?? config.scopes,
        },
      });
      await tx.aocAuditLog.create({ data: {
        action: "VAMSYS_OAUTH_CONNECTED",
        entityType: "Pilot",
        entityId: saved.id,
        message: `Pilot ${saved.callsign ?? saved.displayName} connected vAMSYS OAuth.`,
        metadata: { vamsysPilotId: imported.vamsysPilotId, scopes: token.scope ?? config.scopes },
      } });
      return saved;
    });

    await setPilotSession(pilot.id);
    return finish(request, "/pilot/dashboard");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete vAMSYS OAuth.";
    await writeAuditLogSafely({
      action: "VAMSYS_OAUTH_FAILED",
      entityType: "VamsysOAuth",
      message: "A vAMSYS OAuth connection attempt failed.",
      metadata: { phase: "callback", reason: message.slice(0, 180) },
    });
    return finish(request, "/pilot", "error", message);
  }
}
