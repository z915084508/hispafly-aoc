import { currentAuthUser } from "@/lib/auth/session";
import { getLiveFlights } from "@/lib/acars/live-tracking";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentAuthUser();
  if (!user?.pilot) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ updatedAt: new Date().toISOString(), flights: await getLiveFlights() }, { headers: { "Cache-Control": "no-store" } });
}
