import type { StaffRole } from "@prisma/client";

export type StaffPermission =
  | "PAYROLL_APPROVE"
  | "PAYROLL_REJECT"
  | "PAYROLL_RECALCULATE"
  | "PAYROLL_MARK_PAID"
  | "VAMSYS_PIREP_SYNC"
  | "VAMSYS_OPERATIONS_SYNC";

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  ADMIN: ["PAYROLL_APPROVE", "PAYROLL_REJECT", "PAYROLL_RECALCULATE", "PAYROLL_MARK_PAID", "VAMSYS_PIREP_SYNC", "VAMSYS_OPERATIONS_SYNC"],
  OPS: ["PAYROLL_APPROVE", "PAYROLL_REJECT", "PAYROLL_RECALCULATE", "VAMSYS_PIREP_SYNC", "VAMSYS_OPERATIONS_SYNC"],
  FINANCE: ["PAYROLL_MARK_PAID"],
  VIEWER: [],
};

export function hasStaffPermission(role: StaffRole, permission: StaffPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const roleLabels: Record<StaffRole, string> = {
  ADMIN: "Administrador",
  OPS: "Operaciones",
  FINANCE: "Finanzas",
  VIEWER: "Solo lectura",
};
