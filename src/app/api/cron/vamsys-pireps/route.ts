import type { NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cron/auth";
import { syncAcceptedOperationsPirepsIncremental } from "@/lib/vamsys/operationsPireps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();

  const result = await syncAcceptedOperationsPirepsIncremental({ limit: 50, cron: true });
  const ok = result.errors.length === 0 || result.importedCount + result.updatedCount > 0;
  return Response.json({
    ok,
    imported: result.importedCount,
    updated: result.updatedCount,
    skipped: result.skippedCount,
    payrollGenerated: result.payrollGeneratedCount,
    expensesGenerated: result.expensesGeneratedCount,
    walletTransactions: result.walletTransactionsCount,
    errors: result.errors,
  }, { status: ok ? 200 : 500 });
}
