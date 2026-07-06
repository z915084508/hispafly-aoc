import { getVamsysPilotConfig } from "./config";
import type { VamsysApiRecord, VamsysTokenResponse } from "./types";

export class VamsysApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const configuredTimeout = Number(process.env.VAMSYS_PILOT_API_TIMEOUT_MS ?? "");
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.max(5_000, configuredTimeout) : 25_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new VamsysApiError(`vAMSYS request timed out after ${Math.round(timeoutMs / 1000)}s. Please try Final Dispatch again.`, 504, "timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : undefined;
    const description = typeof payload.error_description === "string" ? payload.error_description : undefined;
    const message = typeof payload.message === "string" ? payload.message : undefined;
    const errors = payload.errors && typeof payload.errors === "object" ? payload.errors as Record<string, unknown> : null;
    const firstValidationError = errors
      ? Object.values(errors).flatMap((value) => Array.isArray(value) ? value : [value]).find((value): value is string => typeof value === "string")
      : undefined;
    const authHint = response.headers.get("www-authenticate");
    const baseMessage = firstValidationError || message || description || code || `vAMSYS request failed with status ${response.status}.`;
    throw new VamsysApiError(authHint ? `${baseMessage} [${authHint}]` : baseMessage, response.status, code);
  }
  return payload as T;
}

async function pilotApiRequest(path: string, accessToken: string, init?: RequestInit): Promise<VamsysApiRecord> {
  const { apiBaseUrl } = getVamsysPilotConfig();
  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (response.status === 401) throw new VamsysApiError("El token de vAMSYS no está autorizado.", 401, "unauthorized");
  return parseResponse<VamsysApiRecord>(response);
}

export interface CreateVamsysBookingInput {
  route_id: number;
  aircraft_id: number;
  departure_time: string;
  network?: string;
  callsign?: string;
  flight_number?: string;
  altitude?: number;
  passengers?: number;
  cargo?: number;
  user_route?: string;
}

export function createVamsysBooking(accessToken: string, input: CreateVamsysBookingInput) {
  return pilotApiRequest("/bookings", accessToken, { method: "POST", body: JSON.stringify(input) });
}

export function cancelVamsysBooking(accessToken: string, bookingId: string) {
  return pilotApiRequest(`/bookings/${encodeURIComponent(bookingId)}`, accessToken, { method: "DELETE" });
}

export function fetchVamsysUser(accessToken: string) {
  return pilotApiRequest("/user", accessToken);
}

export function fetchVamsysProfile(accessToken: string) {
  return pilotApiRequest("/profile", accessToken);
}

async function tokenRequest(parameters: URLSearchParams): Promise<VamsysTokenResponse> {
  const { tokenUrl } = getVamsysPilotConfig();
  const response = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
  });
  const token = await parseResponse<VamsysTokenResponse>(response);
  if (!token.access_token || !Number.isFinite(token.expires_in)) throw new VamsysApiError("vAMSYS returned an invalid token response.", 502, "invalid_response");
  return token;
}

export function exchangeVamsysAuthorizationCode(code: string, codeVerifier: string) {
  const config = getVamsysPilotConfig();
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: codeVerifier,
  }));
}

export function refreshVamsysToken(refreshToken: string) {
  const config = getVamsysPilotConfig();
  return tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken,
  }));
}
