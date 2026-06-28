"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { checkOperationsHealth, syncOperationsPilots } from "@/lib/vamsys/operations";

const finish = (type: "success" | "error", message: string): never => { revalidatePath("/settings/operations"); revalidatePath("/pilots"); revalidatePath("/audit"); redirect(`/settings/operations?${type}=${encodeURIComponent(message)}`); };
export async function testOperationsConnection() { try { const staff = await requireStaffPermission("VAMSYS_OPERATIONS_SYNC", { entityType: "VamsysOperations", attemptedAction: "comprobar la conexión Operations" }); const result = await checkOperationsHealth(); if (!result.healthy) throw new Error(result.message); finish("success", `Conexión correcta para ${staff.name}.`); } catch (error) { finish("error", error instanceof Error ? error.message : "No se pudo comprobar la conexión."); } }
export async function syncOperationsPilotDirectory() { try { const staff = await requireStaffPermission("VAMSYS_OPERATIONS_SYNC", { entityType: "Pilot", attemptedAction: "sincronizar pilotos desde Operations API" }); const result = await syncOperationsPilots(staff.id); finish(result.errors.length && !result.imported && !result.updated ? "error" : "success", `${result.imported} nuevos, ${result.updated} actualizados y ${result.notes} notas${result.errors.length ? `; ${result.errors.length} errores` : ""}.`); } catch (error) { finish("error", error instanceof Error ? error.message : "No se pudieron sincronizar los pilotos."); } }
