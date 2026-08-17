"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateFlightsForSchedule } from "@/lib/native-scheduling/publication";
import { renewFlightScheduleExpiry } from "@/lib/native-scheduling/expiration";
import { requireStaffPermission } from "@/lib/staff/permissions";

export async function renewProgramacionExpiryAction(form: FormData) {
  const staff = await requireStaffPermission("SCHEDULE_STATUS_MANAGE");
  const id = String(form.get("id") ?? "").trim();
  const horizon = [30, 60, 90, 180].includes(Number(form.get("horizon"))) ? Number(form.get("horizon")) : 60;
  if (!id) redirect(`/staff/operations/programacion/expiring?horizon=${horizon}&error=missing-id`);

  const mode = form.get("mode") === "NO_EXPIRY" ? "NO_EXPIRY" : "EXTEND";
  const extendDays = mode === "EXTEND" ? Number(form.get("extendDays")) : undefined;

  try {
    const updated = await renewFlightScheduleExpiry({ scheduleId: id, actor: staff, mode, extendDays });
    let generated = 0;
    let generationWarning = false;
    if (updated.status === "ACTIVE") {
      try {
        generated = (await generateFlightsForSchedule(updated.id, staff)).created;
      } catch {
        generationWarning = true;
      }
    }

    revalidatePath("/staff/operations/programacion");
    revalidatePath("/staff/operations/programacion/expiring");
    revalidatePath("/staff/flights");
    revalidatePath("/pilot/flight-offers");
    redirect(`/staff/operations/programacion/expiring?horizon=${horizon}&renewed=1&generated=${generated}${generationWarning ? "&generationWarning=1" : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo renovar la programación.";
    redirect(`/staff/operations/programacion/expiring?horizon=${horizon}&error=${encodeURIComponent(message)}`);
  }
}
