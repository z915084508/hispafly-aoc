import { NextResponse } from "next/server";
import { currentAuthUser } from "@/lib/auth/session";
import { hasAcarsTestAccess } from "@/lib/acars/access";
import { getAcarsAssignment } from "@/lib/native-flight/dispatch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentAuthUser();
    if (!user?.pilot) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!hasAcarsTestAccess(user)) {
      return NextResponse.json({ error: "acars_beta_access_required" }, { status: 403 });
    }

    const assignment = await getAcarsAssignment(user.pilot.id);
    if (!assignment) {
      return NextResponse.json({ available: false, assignment: null });
    }

    return NextResponse.json({
      available: true,
      assignment: {
        ...assignment,
        passengers: assignment.passengers ?? 0,
        cargoKg: assignment.cargoKg ?? 0,
      },
    });
  } catch (error) {
    console.error("[ACARS assignment] Unable to build released assignment", error);
    return NextResponse.json(
      { available: false, assignment: null, error: "assignment_unavailable" },
      { status: 500 },
    );
  }
}
