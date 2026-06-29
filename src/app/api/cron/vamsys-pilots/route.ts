import type { NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cron/auth";
import { syncOperationsPilotsIncremental } from "@/lib/vamsys/operationsPilotsIncremental";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();

  const result = await syncOperationsPilotsIncremental({ maxPages: 3, cron: true });
  const ok = result.errors.length === 0 || result.imported + result.updated > 0;
  return Response.json({
    ok,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    payrollGenerated: 0,
    errors: result.errors,
  }, { status: ok ? 200 : 500 });
}
