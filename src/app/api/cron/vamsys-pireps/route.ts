import type { NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cron/auth";
import { syncAcceptedOperationsPirepsIncremental } from "@/lib/vamsys/operationsPirepsIncremental";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.round(requestedLimit), 50)) : 10;
  console.info(`[vAMSYS PIREP cron] request accepted limit=${limit}`);
  const result = await syncAcceptedOperationsPirepsIncremental({ limit, cron: true });
  const ok = result.errors.length === 0 || result.importedCount + result.updatedCount > 0;
  return Response.json({
    ok,
    limit,
    imported: result.importedCount,
    updated: result.updatedCount,
    skipped: result.skippedCount,
    payrollGenerated: result.payrollGeneratedCount,
    expensesGenerated: result.expensesGeneratedCount,
    walletTransactions: result.walletTransactionsCount,
    errors: result.errors,
  }, { status: ok ? 200 : 500 });
}
