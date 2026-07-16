import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cron/auth";
import { generateActiveSchedules } from "@/lib/native-flight/schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();
  const today = new Date();
  const to = new Date(today.getTime() + 30 * 86_400_000);
  const result = await generateActiveSchedules(today.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  return NextResponse.json({ ok: true, schedules: result.length, result });
}
