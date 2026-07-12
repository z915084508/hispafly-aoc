import { prisma } from "@/lib/prisma";
import { getCurrentStaff, type StaffIdentity } from "./currentStaff";
import { hasStaffPermission, type StaffPermission } from "./permissions";

interface PermissionContext {
  entityType: string;
  entityId?: string;
  attemptedAction: string;
}

export class StaffAuthorizationError extends Error { constructor(message:string){super(message);this.name="StaffAuthorizationError"} }

export async function requireStaffPermission(
  permission: StaffPermission,
  context: PermissionContext,
): Promise<StaffIdentity> {
  const staff = await getCurrentStaff();
  const allowed = staff?.active && (staff.permissions ? staff.permissions.includes(permission) : hasStaffPermission(staff.role, permission));
  if (allowed && staff) return staff;

  if (staff && staff.id !== "development-staff") {
    const reason = staff.active ? "insufficient_role" : "inactive_staff";
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: staff.id,
        action: "PERMISSION_DENIED",
        entityType: context.entityType,
        entityId: context.entityId,
        message: `${staff.name} intentó ${context.attemptedAction}, pero el acceso fue denegado.`,
        metadata: { permission, role: staff.role, reason },
      },
    });
  }

  throw new StaffAuthorizationError(
    !staff ? "No se ha encontrado el usuario AOC activo." :
    !staff.active ? "Este usuario AOC está inactivo." :
    "Tu rol no permite realizar esta acción.",
  );
}
