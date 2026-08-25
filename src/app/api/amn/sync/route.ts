import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { syncHispaflyNetworkToAmn } from "@/lib/amn/network-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireStaffPermission("ROUTE_EDIT", {
      entityType: "AMNIntegration",
      attemptedAction: "synchronize HISPAFLY network to AMN",
    });
    const body = await request.json().catch(() => ({})) as { horizonDays?: number };
    const horizonDays = Number.isInteger(body.horizonDays)
      ? Math.min(60, Math.max(1, Number(body.horizonDays)))
      : 30;
    const from = new Date();
    const to = new Date(from.getTime() + horizonDays * 86_400_000);
    const result = await syncHispaflyNetworkToAmn({ from, to });
    return NextResponse.json({ ok: result.errors.length === 0, horizonDays, result }, {
      status: result.errors.length === 0 ? 200 : 207,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "AMN synchronization failed.",
    }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
