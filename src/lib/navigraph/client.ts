import { getNavigraphConfig } from "./config";

export interface NavigraphTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
  token_type?: string;
}

export class NavigraphOAuthError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
    this.name = "NavigraphOAuthError";
  }
}

async function tokenRequest(body: URLSearchParams): Promise<NavigraphTokenResponse> {
  const config = getNavigraphConfig();
  body.set("client_id", config.clientId);
  if (config.clientSecret) body.set("client_secret", config.clientSecret);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    const code = typeof payload.error === "string" ? payload.error : undefined;
    const description = typeof payload.error_description === "string" ? payload.error_description : "Navigraph token exchange failed.";
    throw new NavigraphOAuthError(description, code, response.status);
  }
  return payload as unknown as NavigraphTokenResponse;
}

export function exchangeNavigraphAuthorizationCode(code: string, codeVerifier: string) {
  const config = getNavigraphConfig();
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: config.redirectUri,
  }));
}

export function refreshNavigraphToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

export function navigraphSubject(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
