import { NextResponse } from "next/server";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { getVamsysPilotConfig } from "@/lib/vamsys/config";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "@/lib/vamsys/pkce";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60,
};

export async function GET(request: Request) {
  try {
    const config = getVamsysPilotConfig();
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
    response.cookies.set("hispafly_vamsys_oauth_state", state, COOKIE_OPTIONS);
    response.cookies.set("hispafly_vamsys_code_verifier", codeVerifier, COOKIE_OPTIONS);
    response.cookies.set("hispafly_vamsys_oauth_state", state, { ...COOKIE_OPTIONS, path: "/api/vamsys/oauth" });
    response.cookies.set("hispafly_vamsys_code_verifier", codeVerifier, { ...COOKIE_OPTIONS, path: "/api/vamsys/oauth" });
    await writeAuditLogSafely({ action: "VAMSYS_OAUTH_STARTED", entityType: "VamsysOAuth", message: "Un piloto inició la conexión OAuth con vAMSYS." });
    return response;
  } catch (error) {
    const url = new URL("/pilot", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "No se pudo iniciar OAuth.");
    return NextResponse.redirect(url);
  }
}
