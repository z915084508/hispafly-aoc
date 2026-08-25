import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cron/auth";
import { generateActiveSchedules } from "@/lib/native-flight/schedule";
import { isAmnConfigured } from "@/lib/amn/payload";
import { syncHispaflyNetworkToAmn } from "@/lib/amn/network-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();
  const today = new Date();
  const to = new Date(today.getTime() + 30 * 86_400_000);
  const result = await generateActiveSchedules(today.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  let amnSync: Awaited<ReturnType<typeof syncHispaflyNetworkToAmn>> | null = null;
  let amnError: string | null = null;
  if (isAmnConfigured()) {
    try {
      amnSync = await syncHispaflyNetworkToAmn({ from: today, to });
    } catch (error) {
      amnError = error instanceof Error ? error.message : "AMN_SYNC_FAILED";
    }
  }
  return NextResponse.json({
    ok: true,
    schedules: result.length,
    result,
    amn: {
      configured: isAmnConfigured(),
      sync: amnSync,
      error: amnError,
    },
  });
}
