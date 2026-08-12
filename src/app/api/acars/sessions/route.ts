import { currentAuthUser } from "@/lib/auth/session";
import { hasAcarsBetaAccess } from "@/lib/acars/access";
import { effectiveAcarsReleaseChannel } from "@/lib/acars/release-channel";
import { startAcarsSession, type AcarsStartInput } from "@/lib/acars/service";
import { getAcarsReleaseChannel } from "@/lib/software/acars-release";

export async function POST(request: Request) {
  const user = await currentAuthUser();
  if (!user?.pilot) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as AcarsStartInput;
    const publishedChannel = body.acarsVersion ? await getAcarsReleaseChannel(body.acarsVersion) : null;
    const channel = effectiveAcarsReleaseChannel(publishedChannel, body.acarsVersion ?? "");
    if (channel === "BETA" && !hasAcarsBetaAccess(user)) {
      return Response.json({ error: "acars_beta_access_required" }, { status: 403 });
    }
    return Response.json({
      contractVersion: "1.0",
      session: await startAcarsSession(user.pilot.id, body),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "invalid_request" },
      { status: 409 },
    );
  }
}
