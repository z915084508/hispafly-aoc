import { getLiveFlights } from "@/lib/acars/live-tracking";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

export const dynamic = "force-dynamic";
export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff || !staffHasPermission(staff, "DISPATCH_VIEW")) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ updatedAt: new Date().toISOString(), flights: await getLiveFlights() }, { headers: { "Cache-Control": "no-store" } });
}
