import { NextRequest, NextResponse } from "next/server";
import { backfillCompanyEconomy } from "@/lib/economy/backfill";
import { requireStaffPermission } from "@/lib/staff/authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", {
      entityType: "CompanyExpense",
      entityId: "backfill-all",
      attemptedAction: "backfill all company economy data",
    });
    const body = await request.json().catch(() => ({})) as { cursor?: unknown; limit?: unknown };
    const cursor = typeof body.cursor === "string" && body.cursor ? body.cursor : null;
    const requestedLimit = typeof body.limit === "number" ? body.limit : 10;
    const limit = Math.max(1, Math.min(Math.floor(requestedLimit), 10));
    const result = await backfillCompanyEconomy(staff.id, limit, cursor);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Backfill failed." }, { status: 500 });
  }
}
