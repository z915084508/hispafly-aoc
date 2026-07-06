import { getCurrentPilot } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { getValidNavigraphAccessToken } from "@/lib/navigraph/token";

export class EfbApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "EfbApiError"; }
}

function allowedOrigins() {
  return new Set((process.env.EFB_ALLOWED_ORIGINS ?? "https://efb.hispafly.es,http://localhost:3001,http://localhost:3000").split(",").map((item) => item.trim()).filter(Boolean));
}

export function efbCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  if (origin && allowedOrigins().has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function assertEfbOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) throw new EfbApiError(403, "EFB_ORIGIN_FORBIDDEN", "This EFB origin is not allowed.");
}

export function efbJson(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: efbCorsHeaders(request) });
}

export function efbOptions(request: Request) {
  try { assertEfbOrigin(request); return new Response(null, { status: 204, headers: efbCorsHeaders(request) }); }
  catch (error) { return efbErrorResponse(request, error); }
}

export function efbErrorResponse(request: Request, error: unknown) {
  if (error instanceof EfbApiError) return efbJson(request, { error: error.message, code: error.code }, error.status);
  const message = error instanceof Error ? error.message : "Unexpected AOC performance error.";
  return efbJson(request, { error: message, code: "EFB_PERFORMANCE_ERROR" }, 500);
}

export async function authenticateEfbPilot(request: Request) {
  assertEfbOrigin(request);
  const pilot = await getCurrentPilot();
  if (!pilot) throw new EfbApiError(401, "PILOT_LOGIN_REQUIRED", "Please log in with your HISPAFLY AOC account.");
  const oauth = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true } });
  if (!oauth) throw new EfbApiError(403, "CONNECT_NAVIGRAPH_REQUIRED", "Connect Navigraph / SimBrief in AOC before using performance calculations.");
  if (oauth.revokedAt) throw new EfbApiError(403, "NAVIGRAPH_RECONNECT_REQUIRED", "Reconnect Navigraph / SimBrief in AOC.");
  try { await getValidNavigraphAccessToken(pilot.id); }
  catch { throw new EfbApiError(403, "NAVIGRAPH_RECONNECT_REQUIRED", "Reconnect Navigraph / SimBrief in AOC."); }
  return pilot;
}

