import { getCurrentPilot } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { getValidNavigraphAccessToken } from "@/lib/navigraph/token";
import { fetchVamsysProfile, fetchVamsysUser } from "@/lib/vamsys/client";
import { mapVamsysPilot } from "@/lib/vamsys/pilotMapper";

export class EfbApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "EfbApiError"; }
}

const DEFAULT_EFB_ALLOWED_ORIGINS = [
  "https://efb.hispafly.es",
  "https://hispafly-efb.vercel.app",
  "http://localhost:3001",
  "http://localhost:3000",
];

function allowedOrigins() {
  return new Set([
    ...DEFAULT_EFB_ALLOWED_ORIGINS,
    ...(process.env.EFB_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  ]);
}

export function efbCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
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
  if (error instanceof EfbApiError) return efbJson(request, { error: error.message, message: error.message, code: error.code }, error.status);
  const message = error instanceof Error ? error.message : "Unexpected AOC performance error.";
  return efbJson(request, { error: message, message, code: "EFB_PERFORMANCE_ERROR" }, 500);
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function getPilotFromEfbBearer(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;
  try {
    const [userResponse, profileResponse] = await Promise.all([
      fetchVamsysUser(token),
      fetchVamsysProfile(token),
    ]);
    const mapped = mapVamsysPilot(userResponse, profileResponse);
    return prisma.pilot.findFirst({
      where: {
        OR: [
          { vamsysPilotId: mapped.vamsysPilotId },
          ...(mapped.vamsysUserId ? [{ vamsysUserId: mapped.vamsysUserId }] : []),
        ],
      },
    }).catch(() => null);
  } catch {
    throw new EfbApiError(401, "EFB_VAMSYS_TOKEN_INVALID", "Your EFB vAMSYS session is no longer valid. Log out and log in again.");
  }
}

export async function authenticateEfbPilot(request: Request) {
  assertEfbOrigin(request);
  const pilot = await getCurrentPilot() ?? await getPilotFromEfbBearer(request);
  if (!pilot) throw new EfbApiError(401, "PILOT_LOGIN_REQUIRED", "Please log in with VAMSYS in EFB, or log in to your HISPAFLY AOC pilot account.");
  const oauth = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true } });
  if (!oauth) throw new EfbApiError(403, "CONNECT_NAVIGRAPH_REQUIRED", "Connect Navigraph / SimBrief in AOC before using performance calculations.");
  if (oauth.revokedAt) throw new EfbApiError(403, "NAVIGRAPH_RECONNECT_REQUIRED", "Reconnect Navigraph / SimBrief in AOC.");
  try { await getValidNavigraphAccessToken(pilot.id); }
  catch { throw new EfbApiError(403, "NAVIGRAPH_RECONNECT_REQUIRED", "Reconnect Navigraph / SimBrief in AOC."); }
  return pilot;
}
