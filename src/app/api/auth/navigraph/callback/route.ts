import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentPilot } from "@/lib/pilot/session";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { exchangeNavigraphAuthorizationCode, navigraphSubject } from "@/lib/navigraph/client";
import { getNavigraphConfig } from "@/lib/navigraph/config";
import { secureStateEquals } from "@/lib/vamsys/pkce";

function finish(request: NextRequest, status: "connected" | "failed") {
  const url = new URL("/pilot/dashboard", request.url);
  url.searchParams.set("navigraph", status);
  const response = NextResponse.redirect(url);
  response.cookies.set("hispafly_navigraph_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set("hispafly_navigraph_code_verifier", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const pilot = await getCurrentPilot();
  const providerError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("hispafly_navigraph_oauth_state")?.value;
  const codeVerifier = request.cookies.get("hispafly_navigraph_code_verifier")?.value;
  try {
    if (!pilot) throw new Error("Pilot session expired.");
    if (providerError) throw new Error("Navigraph rejected authorization.");
    if (!code || !state || !expectedState || !codeVerifier || !secureStateEquals(expectedState, state)) throw new Error("Invalid or expired OAuth state.");
    const config = getNavigraphConfig();
    const token = await exchangeNavigraphAuthorizationCode(code, codeVerifier);
    if (!token.refresh_token) throw new Error("Navigraph did not return an offline refresh token.");
    const expiresIn = Number.isFinite(token.expires_in) && token.expires_in > 0 ? token.expires_in : 3600;
    await prisma.$transaction(async (tx) => {
      await tx.navigraphOAuthToken.upsert({
        where: { pilotId: pilot.id },
        update: {
          navigraphUserId: navigraphSubject(token.id_token), accessToken: token.access_token, refreshToken: token.refresh_token!,
          expiresAt: new Date(Date.now() + expiresIn * 1000), scopes: token.scope ?? config.scopes, revokedAt: null, connectedAt: new Date(),
        },
        create: {
          pilotId: pilot.id, navigraphUserId: navigraphSubject(token.id_token), accessToken: token.access_token, refreshToken: token.refresh_token!,
          expiresAt: new Date(Date.now() + expiresIn * 1000), scopes: token.scope ?? config.scopes,
        },
      });
      await tx.aocAuditLog.create({ data: { action: "NAVIGRAPH_OAUTH_CONNECTED", entityType: "Pilot", entityId: pilot.id, message: "Pilot connected Navigraph / SimBrief OAuth.", metadata: { pilotId: pilot.id, scopes: token.scope ?? config.scopes } } });
    });
    return finish(request, "connected");
  } catch {
    await writeAuditLogSafely({ action: "NAVIGRAPH_OAUTH_FAILED", entityType: "Pilot", entityId: pilot?.id, message: "Navigraph OAuth connection failed.", metadata: { pilotId: pilot?.id ?? null, phase: "callback", hasCode: Boolean(code), hasState: Boolean(state), hasExpectedState: Boolean(expectedState), hasCodeVerifier: Boolean(codeVerifier) } });
    return finish(request, "failed");
  }
}
