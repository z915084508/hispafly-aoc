import { NextResponse } from "next/server";
import { getCurrentPilot } from "@/lib/pilot/session";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { getNavigraphConfig } from "@/lib/navigraph/config";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "@/lib/vamsys/pkce";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60,
};

export async function GET(request: Request) {
  const pilot = await getCurrentPilot();
  if (!pilot) return NextResponse.redirect(new URL("/pilot", request.url));
  try {
    const config = getNavigraphConfig();
    const codeVerifier = generateCodeVerifier();
    const state = generateState();
    const authorizationUrl = new URL(config.authorizationUrl);
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes,
      state,
      code_challenge: generateCodeChallenge(codeVerifier),
      code_challenge_method: "S256",
    }).toString();
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set("hispafly_navigraph_oauth_state", state, COOKIE_OPTIONS);
    response.cookies.set("hispafly_navigraph_code_verifier", codeVerifier, COOKIE_OPTIONS);
    await writeAuditLogSafely({ action: "NAVIGRAPH_OAUTH_STARTED", entityType: "Pilot", entityId: pilot.id, message: "Pilot started Navigraph OAuth.", metadata: { pilotId: pilot.id } });
    return response;
  } catch (error) {
    await writeAuditLogSafely({ action: "NAVIGRAPH_OAUTH_FAILED", entityType: "Pilot", entityId: pilot.id, message: "Navigraph OAuth could not be started.", metadata: { pilotId: pilot.id, phase: "start" } });
    const url = new URL("/pilot/dashboard", request.url);
    url.searchParams.set("navigraph", "failed");
    return NextResponse.redirect(url);
  }
}
