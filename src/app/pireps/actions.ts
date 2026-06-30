"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { syncAcceptedPirepsForPilot } from "@/lib/vamsys/pireps";
import { syncAcceptedOperationsPireps } from "@/lib/vamsys/operationsPireps";

function pilotId(formData: FormData) {
  const id = formData.get("pilotId");
  if (typeof id !== "string" || !id) throw new Error("Falta el identificador del piloto.");
  return id;
}

function finish(type: "success" | "error", message: string): never {
  revalidatePath("/");
  revalidatePath("/pilots");
  revalidatePath("/pireps");
  revalidatePath("/staff/pireps");
  revalidatePath("/payroll");
  revalidatePath("/audit");
  redirect(`/staff/pireps?${type}=${encodeURIComponent(message)}`);
}

function errorSummary(errors: string[]) {
  if (!errors.length) return "";
  const preview = errors.slice(0, 3).join(" ");
  const suffix = errors.length > 3 ? ` (+${errors.length - 3} más)` : "";
  return `; ${errors.length} errores: ${preview}${suffix}`;
}

export async function syncAllPireps() {
  let feedback: { type: "success" | "error"; message: string };

  try {
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "VamsysPirepSync", attemptedAction: "sincronizar los PIREPs de todos los pilotos" });
    const result = await syncAcceptedOperationsPireps(staff.id);
    const message = `${result.importedCount} importados, ${result.updatedCount} actualizados, ${result.payrollGeneratedCount} nóminas, ${result.walletTransactionsCount} movimientos de cartera y ${result.expensesGeneratedCount} gastos generados${errorSummary(result.errors)}.`;
    feedback = { type: result.errors.length > 0 && result.importedCount + result.updatedCount === 0 ? "error" : "success", message };
  } catch (error) {
    feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo iniciar la sincronización." };
  }

  finish(feedback.type, feedback.message);
}

export async function syncPilotPireps(formData: FormData) {
  let feedback: { type: "success" | "error"; message: string };

  try {
    const id = pilotId(formData);
    const staff = await requireStaffPermission("VAMSYS_PIREP_SYNC", { entityType: "Pilot", entityId: id, attemptedAction: `sincronizar los PIREPs del piloto ${id}` });
    const result = await syncAcceptedPirepsForPilot(id, { staffUserId: staff.id });
    const message = `${result.importedCount} importados, ${result.updatedCount} actualizados y ${result.payrollGeneratedCount} nóminas generadas${errorSummary(result.errors)}.`;
    feedback = { type: result.errors.length && result.importedCount + result.updatedCount === 0 ? "error" : "success", message };
  } catch (error) {
    feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo sincronizar el piloto." };
  }

  finish(feedback.type, feedback.message);
}
