"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { checkOperationsHealth, syncOperationsPilots } from "@/lib/vamsys/operations";

function finish(type: "success" | "error", message: string): never {
  revalidatePath("/settings/operations");
  revalidatePath("/pilots");
  revalidatePath("/audit");
  revalidatePath("/");
  redirect(`/settings/operations?${type}=${encodeURIComponent(message)}`);
}

export async function testOperationsConnection() {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("VAMSYS_OPERATIONS_SYNC", { entityType: "VamsysOperations", attemptedAction: "comprobar la conexión Operations" });
    const result = await checkOperationsHealth();
    if (!result.healthy) throw new Error(result.message);
    feedback = { type: "success", message: `Conexión correcta para ${staff.name}.` };
  } catch (error) {
    feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo comprobar la conexión." };
  }
  finish(feedback.type, feedback.message);
}

export async function syncOperationsPilotDirectory() {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("VAMSYS_OPERATIONS_SYNC", { entityType: "Pilot", attemptedAction: "sincronizar pilotos desde Operations API" });
    const result = await syncOperationsPilots(staff.id);
    feedback = {
      type: result.errors.length && !result.imported && !result.updated ? "error" : "success",
      message: `${result.imported} nuevos, ${result.updated} actualizados, ${result.notes} notas y ${result.removedMocks} pilotos de demostración eliminados${result.errors.length ? `; ${result.errors.length} errores` : ""}.`,
    };
  } catch (error) {
    feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudieron sincronizar los pilotos." };
  }
  finish(feedback.type, feedback.message);
}
