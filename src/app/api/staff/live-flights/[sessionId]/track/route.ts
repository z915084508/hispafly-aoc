import { getFlightTrack } from "@/lib/acars/live-tracking";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff || !staffHasPermission(staff, "DISPATCH_VIEW")) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ points: await getFlightTrack((await params).sessionId) }, { headers: { "Cache-Control": "no-store" } });
}
