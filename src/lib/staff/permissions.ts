import type { StaffRole } from "@prisma/client";
import { ROLE_TEMPLATE_PERMISSIONS, type StaffPermissionCode } from "./access/catalog.ts";

export type LegacyStaffPermission =
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
  | "FLEET_DELETE"
  | "AIRCRAFT_VIEW"
  | "AIRCRAFT_SYNC"
  | "AIRCRAFT_CREATE"
  | "AIRCRAFT_EDIT"
  | "AIRCRAFT_DELETE";
export type StaffPermission = StaffPermissionCode | LegacyStaffPermission;

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  ADMIN: ["PAYROLL_APPROVE", "PAYROLL_REJECT", "PAYROLL_RECALCULATE", "PAYROLL_MARK_PAID", "VAMSYS_PIREP_SYNC", "FLIGHT_OFFER_MANAGE", "ROUTE_VIEW", "ROUTE_SYNC", "ROUTE_CREATE", "ROUTE_EDIT", "ROUTE_ARCHIVE", "FLEET_VIEW", "FLEET_SYNC", "FLEET_CREATE", "FLEET_EDIT", "FLEET_DELETE", "AIRCRAFT_VIEW", "AIRCRAFT_SYNC", "AIRCRAFT_CREATE", "AIRCRAFT_EDIT", "AIRCRAFT_DELETE"],
  OPS: ["PAYROLL_APPROVE", "PAYROLL_REJECT", "PAYROLL_RECALCULATE", "VAMSYS_PIREP_SYNC", "FLIGHT_OFFER_MANAGE", "ROUTE_VIEW", "ROUTE_SYNC", "ROUTE_CREATE", "ROUTE_EDIT", "ROUTE_ARCHIVE", "FLEET_VIEW", "FLEET_SYNC", "FLEET_CREATE", "FLEET_EDIT", "AIRCRAFT_VIEW", "AIRCRAFT_SYNC", "AIRCRAFT_CREATE", "AIRCRAFT_EDIT"],
  FINANCE: ["PAYROLL_MARK_PAID"],
  VIEWER: ["ROUTE_VIEW", "FLEET_VIEW", "AIRCRAFT_VIEW"],
};

export function hasStaffPermission(role: StaffRole, permission: StaffPermission): boolean {
  if (ROLE_PERMISSIONS[role].includes(permission as LegacyStaffPermission)) return true;
  const template = role === "ADMIN" ? ROLE_TEMPLATE_PERMISSIONS.ADMIN : role === "OPS" ? ROLE_TEMPLATE_PERMISSIONS.LEGACY_OPS : role === "FINANCE" ? ROLE_TEMPLATE_PERMISSIONS.LEGACY_FINANCE : ROLE_TEMPLATE_PERMISSIONS.VIEWER;
  return (template as readonly string[]).includes(permission);
}
export function staffHasPermission(staff:{role:StaffRole;permissions?:readonly string[]}|null|undefined,permission:StaffPermission){return Boolean(staff&&(staff.permissions?staff.permissions.includes(permission):hasStaffPermission(staff.role,permission)))}

export const roleLabels: Record<StaffRole, string> = {
  ADMIN: "Administrador",
  OPS: "Operaciones",
  FINANCE: "Finanzas",
  VIEWER: "Solo lectura",
};
