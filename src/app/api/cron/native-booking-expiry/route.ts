import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cron/auth";
import { expireNativeBookings } from "@/lib/native-flight/booking";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();
  return NextResponse.json({ ok: true, ...(await expireNativeBookings()) });
}
