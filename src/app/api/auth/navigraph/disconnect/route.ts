import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentPilot } from "@/lib/pilot/session";
import { writeAuditLogSafely } from "@/lib/audit/log";

export async function POST(request: NextRequest) {
  const pilot = await getCurrentPilot();
  if (!pilot) return NextResponse.redirect(new URL("/pilot", request.url), 303);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  await prisma.navigraphOAuthToken.updateMany({ where: { pilotId: pilot.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAuditLogSafely({ action: "NAVIGRAPH_OAUTH_DISCONNECTED", entityType: "Pilot", entityId: pilot.id, message: "Pilot disconnected Navigraph / SimBrief OAuth.", metadata: { pilotId: pilot.id } });
  const url = new URL("/pilot/dashboard", request.url);
  url.searchParams.set("navigraph", "disconnected");
  return NextResponse.redirect(url, 303);
}
