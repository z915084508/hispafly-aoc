import { currentAuthUser } from "@/lib/auth/session";
import { getFlightTrack } from "@/lib/acars/live-tracking";

export async function GET(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentAuthUser();
  if (!user?.pilot) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ points: await getFlightTrack((await params).sessionId) }, { headers: { "Cache-Control": "no-store" } });
}
