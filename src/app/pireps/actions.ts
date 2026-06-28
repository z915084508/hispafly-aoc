"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { syncAcceptedPirepsForAllConnectedPilots, syncAcceptedPirepsForPilot } from "@/lib/vamsys/pireps";

function pilotId(formData: FormData) {
  const id = formData.get("pilotId");
  if (typeof id !== "string" || !id) throw new Error("Falta el identificador del piloto.");
  return id;
}

function finish(type: "success" | "error", message: string): never {
  revalidatePath("/");
  revalidatePath("/pilots");
  revalidatePath("/pireps");
  revalidatePath("/payroll");
  revalidatePath("/audit");
  redirect(`/pireps?${type}=${encodeURIComponent(message)}`);
}

export async function syncAllPireps() {
  try {
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "VamsysPirepSync", attemptedAction: "sincronizar los PIREPs de todos los pilotos" });
    const result = await syncAcceptedPirepsForAllConnectedPilots({ staffUserId: staff.id });
    const failedPilots = result.results.filter((item) => item.errors.length > 0).length;
    const message = `${result.importedCount} importados, ${result.updatedCount} actualizados y ${result.payrollGeneratedCount} nóminas generadas${failedPilots ? `; ${failedPilots} piloto(s) con errores` : ""}.`;
    finish(failedPilots === result.results.length && failedPilots > 0 ? "error" : "success", message);
  } catch (error) {
    finish("error", error instanceof Error ? error.message : "No se pudo iniciar la sincronización.");
  }
}

export async function syncPilotPireps(formData: FormData) {
  try {
    const id = pilotId(formData);
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "Pilot", entityId: id, attemptedAction: `sincronizar los PIREPs del piloto ${id}` });
    const result = await syncAcceptedPirepsForPilot(id, { staffUserId: staff.id });
    const message = `${result.importedCount} importados, ${result.updatedCount} actualizados y ${result.payrollGeneratedCount} nóminas generadas${result.errors.length ? `; ${result.errors.join(" ")}` : ""}.`;
    finish(result.errors.length && result.importedCount + result.updatedCount === 0 ? "error" : "success", message);
  } catch (error) {
    finish("error", error instanceof Error ? error.message : "No se pudo sincronizar el piloto.");
  }
}
