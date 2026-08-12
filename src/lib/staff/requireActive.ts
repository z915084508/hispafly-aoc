import { redirect } from "next/navigation";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { getCurrentStaff, type StaffIdentity } from "./currentStaff";

/**
 * Protects the shared Staff Portal shell without imposing an administrator role.
 * Page-level permissions remain responsible for authorizing individual features.
 */
export async function requireActiveStaff(): Promise<StaffIdentity> {
  const staff = await getCurrentStaff();

  if (!staff?.active) {
    await writeAuditLogSafely({
      staffUserId: staff?.id === "development-staff" ? undefined : staff?.id,
      action: "STAFF_PORTAL_ACCESS_DENIED",
      entityType: "StaffPortal",
      message: "Se denegó un intento de acceso al STAFF PORTAL sin una sesión Staff activa.",
      metadata: { active: staff?.active ?? false },
    });
    redirect("/admin-login?error=staff_access_denied");
  }

  return staff;
}
