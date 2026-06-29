"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { syncOperationsFleetData } from "@/lib/vamsys/fleetSync";

const readableError = (error: unknown) => error instanceof Error ? error.message : "No se pudo completar la accion.";

export async function syncFleetDataAction() {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "Aircraft", entityId: "fleet", attemptedAction: "sync vAMSYS fleet and aircraft" });
    const result = await syncOperationsFleetData(staff.id);
    const totalAircraft = result.aircraftImported + result.aircraftUpdated;
    const totalFleets = result.fleetsImported + result.fleetsUpdated;
    const suffix = result.errors.length ? ` Avisos: ${result.errors.slice(0, 2).join(" | ")}` : "";
    feedback = { type: result.errors.length ? "error" : "success", message: `Fleet sync: ${totalFleets} flotas y ${totalAircraft} aeronaves procesadas.${suffix}` };
  } catch (error) {
    feedback = { type: "error", message: readableError(error) };
  }
  revalidatePath("/staff/settings/operations");
  revalidatePath("/staff/audit");
  redirect(`/staff/settings/operations?${feedback.type}=${encodeURIComponent(feedback.message)}`);
}
