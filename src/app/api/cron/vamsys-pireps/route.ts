import type { NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cron/auth";
import { syncAcceptedOperationsPirepsIncremental } from "@/lib/vamsys/operationsPirepsIncremental";
import { expireOverdueFlightDispatches } from "@/lib/flightOffers/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function cronTimeout(limit: number) {
  return new Promise<Response>((resolve) => {
    setTimeout(() => {
      console.warn(`[vAMSYS PIREP cron] timed out before completion limit=${limit}`);
      resolve(Response.json({
        ok: false,
        limit,
        error: "vAMSYS PIREP cron did not finish within 25 seconds. Try again with limit=1, or check Vercel logs for the last processing message.",
      }, { status: 504 }));
    }, 25_000);
  });
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.round(requestedLimit), 50)) : 10;
  console.info(`[vAMSYS PIREP cron] request accepted limit=${limit}`);
  return Promise.race([
    Promise.all([syncAcceptedOperationsPirepsIncremental({ limit, cron: true }), expireOverdueFlightDispatches(Math.min(limit, 10))]).then(([result, offerExpiry]) => {
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
        offersExpired: offerExpiry.expired,
        offerExpiryErrors: offerExpiry.errors,
        errors: result.errors,
      }, { status: ok ? 200 : 500 });
    }),
    cronTimeout(limit),
  ]);
}
