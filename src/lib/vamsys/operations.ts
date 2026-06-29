const env = (name: string, fallback?: string) => process.env[name]?.trim() || fallback || "";

interface OperationsToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: OperationsToken | null = null;

export function getOperationsBaseUrl() {
  return env("VAMSYS_OPERATIONS_API_BASE_URL", "https://vamsys.io/api/v3/operations").replace(/\/$/, "");
}

export function isOperationsConfigured() {
  return Boolean(env("VAMSYS_OPERATIONS_CLIENT_ID") && env("VAMSYS_OPERATIONS_CLIENT_SECRET") && getOperationsBaseUrl());
}

async function getOperationsAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.accessToken;

  const clientId = env("VAMSYS_OPERATIONS_CLIENT_ID");
  const secret = env("VAMSYS_OPERATIONS_CLIENT_SECRET");
  if (!clientId || !secret) throw new Error("vAMSYS Operations API is not configured.");

  const response = await fetch(env("VAMSYS_OPERATIONS_TOKEN_URL", "https://vamsys.io/oauth/token"), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret, scope: "*" }),
    cache: "no-store",
  });

  const token = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; error_description?: string; error?: string } | null;
  if (!response.ok || !token?.access_token) {
    throw new Error(token?.error_description || token?.error || `vAMSYS Operations token request failed with status ${response.status}.`);
  }

  cachedToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

function operationsUrl(pathOrUrl: string) {
  const base = new URL(`${getOperationsBaseUrl()}/`);
  const requested = new URL(pathOrUrl, base);
  if (requested.origin !== base.origin || !requested.pathname.startsWith(base.pathname)) {
    throw new Error("vAMSYS Operations pagination URL is outside the configured API base.");
  }
  return requested;
}

export async function operationsRequest(pathOrUrl: string) {
  const token = await getOperationsAccessToken();
  const response = await fetch(operationsUrl(pathOrUrl), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`vAMSYS Operations request failed with status ${response.status}.`);
  return body;
}
