"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { syncAcceptedOperationsPireps } from "@/lib/vamsys/operationsPireps";

function finish(type: "success" | "error", message: string): never {
  revalidatePath("/");
  revalidatePath("/pireps");
  revalidatePath("/payroll");
  revalidatePath("/audit");
  redirect(`/pireps?${type}=${encodeURIComponent(message)}`);
}

export async function syncAllPireps() {
  try {
    const staff = await requireStaffPermission("PIREP_SYNC", {
      entityType: "VamsysPirepSync",
      attemptedAction: "sincronizar los PIREPs históricos de vAMSYS",
    });
    const result = await syncAcceptedOperationsPireps(staff.id);
    const message = `${result.importedCount} imported, ${result.updatedCount} updated, ${result.skippedCount} skipped, ${result.payrollGeneratedCount} payroll records generated, ${result.expensesGeneratedCount} expenses updated and ${result.walletTransactionsCount} wallet transactions created${result.errors.length ? `; ${result.errors.length} errors` : ""}.`;
    finish(result.errors.length > 0 && result.importedCount + result.updatedCount === 0 ? "error" : "success", message);
  } catch (error) {
    finish("error", error instanceof Error ? error.message : "Could not start PIREP synchronization.");
  }
}
