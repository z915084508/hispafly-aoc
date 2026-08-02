import { NextResponse } from "next/server";
import { StaffAuthorizationError, requireStaffPermission } from "@/lib/staff/authorization";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { parseScheduleValidationPayload, scheduleValidationAccessStatus } from "@/lib/native-scheduling/request";
import { validateProposedSchedule } from "@/lib/native-scheduling/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const staff = await getCurrentStaff();
    const access = scheduleValidationAccessStatus(staff);
    if (access === 401) return NextResponse.json({ error: "Staff authentication required." }, { status: 401 });
    if (access === 403) {
      try { await requireStaffPermission("SCHEDULE_CREATE", { entityType: "FlightSchedule", attemptedAction: "validate a proposed flight schedule" }); } catch { /* denial is audited by the shared authorization service */ }
      return NextResponse.json({ error: "Schedule validation permission required." }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    const parsed = parseScheduleValidationPayload(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    await requireStaffPermission(parsed.value.scheduleId ? "SCHEDULE_EDIT" : "SCHEDULE_CREATE", { entityType: "FlightSchedule", entityId: parsed.value.scheduleId, attemptedAction: "validate a proposed flight schedule" });
    const result = await validateProposedSchedule(parsed.value, { excludeScheduleId: parsed.value.scheduleId, includeExistingGeneratedFlights: true });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof StaffAuthorizationError) return NextResponse.json({ error: "Schedule validation permission required." }, { status: 403 });
    console.error("Unable to validate proposed FlightSchedule.");
    return NextResponse.json({ error: "Unable to validate the proposed schedule." }, { status: 500 });
  }
}
