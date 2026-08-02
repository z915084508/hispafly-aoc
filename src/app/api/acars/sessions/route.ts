import { currentAuthUser } from "@/lib/auth/session";
import { hasAcarsTestAccess } from "@/lib/acars/access";
import { startAcarsSession } from "@/lib/acars/service";

export async function POST(request: Request) {
  const user = await currentAuthUser();
  if (!user?.pilot) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAcarsTestAccess(user)) return Response.json({ error: "acars_beta_access_required" }, { status: 403 });

  try {
    return Response.json({
      contractVersion: "1.0",
      session: await startAcarsSession(user.pilot.id, await request.json()),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "invalid_request" },
      { status: 409 },
    );
  }
}
