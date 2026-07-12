import type { StaffRole } from "@prisma/client";

export type StaffPermission =
  | "PAYROLL_APPROVE"
  | "PAYROLL_REJECT"
  | "PAYROLL_RECALCULATE"
  | "PAYROLL_MARK_PAID"
  | "VAMSYS_PIREP_SYNC"
  | "FLIGHT_OFFER_MANAGE"
  | "ROUTE_VIEW"
  | "ROUTE_SYNC"
  | "ROUTE_CREATE"
  | "ROUTE_EDIT"
  | "ROUTE_ARCHIVE"
  | "FLEET_VIEW"
  | "FLEET_SYNC"
  | "FLEET_CREATE"
  | "FLEET_EDIT"
  | "FLEET_DELETE";

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  ADMIN: ["PAYROLL_APPROVE", "PAYROLL_REJECT", "PAYROLL_RECALCULATE", "PAYROLL_MARK_PAID", "VAMSYS_PIREP_SYNC", "FLIGHT_OFFER_MANAGE", "ROUTE_VIEW", "ROUTE_SYNC", "ROUTE_CREATE", "ROUTE_EDIT", "ROUTE_ARCHIVE", "FLEET_VIEW", "FLEET_SYNC", "FLEET_CREATE", "FLEET_EDIT", "FLEET_DELETE"],
  OPS: ["PAYROLL_APPROVE", "PAYROLL_REJECT", "PAYROLL_RECALCULATE", "VAMSYS_PIREP_SYNC", "FLIGHT_OFFER_MANAGE", "ROUTE_VIEW", "ROUTE_SYNC", "ROUTE_CREATE", "ROUTE_EDIT", "ROUTE_ARCHIVE", "FLEET_VIEW", "FLEET_SYNC", "FLEET_CREATE", "FLEET_EDIT"],
  FINANCE: ["PAYROLL_MARK_PAID"],
  VIEWER: ["ROUTE_VIEW", "FLEET_VIEW"],
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
