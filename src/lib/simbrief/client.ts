import { writeAuditLogSafely } from "@/lib/audit/log";
import { prisma } from "@/lib/prisma";
import { getValidNavigraphAccessToken } from "./token";
import { buildSimBriefApiUrl } from "./config";
import { parseSimBriefError, SimBriefApiError } from "./errors";
import { buildSimBriefPayload, type SimBriefFlightplan, type SimBriefFlightplanList, type SimBriefPayload, type SimBriefQuery } from "./types";

function queryString(query?: SimBriefQuery) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) params.set(key, value.filter((item) => item !== null).join(","));
    else params.set(key, String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

async function responsePayload(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json().catch(() => ({}));
  const body = await response.text().catch(() => "");
  return body ? { message: body.slice(0, 500) } : {};
}

async function send(path: string, accessToken: string | null, init: RequestInit, query?: SimBriefQuery) {
  const url = `${buildSimBriefApiUrl(path)}${queryString(query)}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  console.info("SimBrief API request", { method: init.method || "GET", path, status: response.status });
  return response;
}

async function simBriefRequest<T>(pilotId: string | null, path: string, init: RequestInit = {}, query?: SimBriefQuery): Promise<T> {
  let accessToken = pilotId ? await getValidNavigraphAccessToken(pilotId) : null;
  let response = await send(path, accessToken, init, query);

  if (response.status === 401 && pilotId) {
    await writeAuditLogSafely({ action: "SIMBRIEF_TOKEN_REFRESH_REQUIRED", entityType: "Pilot", entityId: pilotId, message: "SimBrief rejected the current Navigraph token; one refresh attempt was started.", metadata: { pilotId, path } });
    try {
      accessToken = await getValidNavigraphAccessToken(pilotId, { forceRefresh: true });
      response = await send(path, accessToken, init, query);
    } catch (error) {
      await writeAuditLogSafely({ action: "SIMBRIEF_TOKEN_REFRESH_FAILED", entityType: "Pilot", entityId: pilotId, message: "SimBrief request could not refresh Navigraph authorization.", metadata: { pilotId, path } });
      throw error;
    }
  }

  const payload = await responsePayload(response);
  if (!response.ok) {
    const error = parseSimBriefError(response.status, payload);
    if (response.status === 401 && pilotId) {
      await prisma.navigraphOAuthToken.updateMany({ where: { pilotId }, data: { revokedAt: new Date() } });
    }
    await writeAuditLogSafely({ action: "SIMBRIEF_API_REQUEST_FAILED", entityType: "Pilot", entityId: pilotId, message: error.message, metadata: { pilotId, path, method: init.method || "GET", status: response.status, code: error.code ?? null } });
    throw error;
  }
  return payload as T;
}

export function listSimBriefFlightplans(pilotId: string, limit?: number) {
  return simBriefRequest<SimBriefFlightplanList>(pilotId, "/v2/flightplans", {}, { limit });
}

export function getLatestSimBriefFlightplan(pilotId: string, keys?: readonly string[]) {
  return simBriefRequest<SimBriefFlightplan>(pilotId, "/v2/flightplans/latest", {}, { keys });
}

export function getSimBriefFlightplan(pilotId: string, requestIdOrStaticId: string, keys?: readonly string[]) {
  return simBriefRequest<SimBriefFlightplan>(pilotId, `/v2/flightplans/${encodeURIComponent(requestIdOrStaticId)}`, {}, { keys });
}

export function generateSimBriefFlightplan(pilotId: string, payload: SimBriefPayload) {
  return simBriefRequest<SimBriefFlightplan>(pilotId, "/v2/plan/generate", { method: "POST", body: JSON.stringify(buildSimBriefPayload(payload)) });
}

export function calculateSimBriefFlightplan(pilotId: string, payload: SimBriefPayload) {
  return simBriefRequest<SimBriefFlightplan>(pilotId, "/v2/plan/calculate", { method: "POST", body: JSON.stringify(buildSimBriefPayload(payload)) });
}

export function getSimBriefSystemAirframes() {
  return simBriefRequest<Record<string, unknown>>(null, "/v2/airframes");
}

export function getUserSimBriefAirframes(pilotId: string, id?: string) {
  const suffix = id ? `/${encodeURIComponent(id)}` : "";
  return simBriefRequest<Record<string, unknown>>(pilotId, `/v2/airframes/user/mine${suffix}`);
}

export function getSimBriefLayouts() {
  return simBriefRequest<Record<string, unknown>>(null, "/v2/plan/inputs");
}

export function calculateTakeoffPerformance(pilotId: string, params: SimBriefQuery) {
  return simBriefRequest<Record<string, unknown>>(pilotId, "/v2/performance/takeoff", {}, params);
}

export function calculateLandingPerformance(pilotId: string, params: SimBriefQuery) {
  return simBriefRequest<Record<string, unknown>>(pilotId, "/v2/performance/landing", {}, params);
}

export { SimBriefApiError };

