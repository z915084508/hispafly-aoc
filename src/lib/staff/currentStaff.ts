import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasValidAdminSession } from "./adminSession";
import { getCurrentStaffSession } from "./auth/session";
import { getStaffCredential } from "./auth/credentials";

export interface StaffIdentity {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  staffCode?: string | null;
  roleTemplateCode?: string | null;
  roleTemplateName?: string | null;
  isSystemOwner?: boolean;
  permissions?: readonly string[];
  mustChangePassword?: boolean;
  sessionId?: string | null;
}

const DEVELOPMENT_STAFF: Record<string, Omit<StaffIdentity, "id">> = {
  "admin@hispafly.local": { name: "María Administradora", email: "admin@hispafly.local", role: "ADMIN", active: true },
  "ops@hispafly.local": { name: "Óscar Operaciones", email: "ops@hispafly.local", role: "OPS", active: true },
  "finance@hispafly.local": { name: "Carlos Finanzas", email: "finance@hispafly.local", role: "FINANCE", active: true },
  "viewer@hispafly.local": { name: "Vera Consulta", email: "viewer@hispafly.local", role: "VIEWER", active: true },
};

export const developmentStaffEmail = process.env.MOCK_STAFF_EMAIL ?? "admin@hispafly.local";
export const adminStaffEmail = process.env.AOC_ADMIN_STAFF_EMAIL ?? "admin@hispafly.local";
export const databaseConfigured = Boolean(process.env.DATABASE_URL);

export async function getCurrentStaff(): Promise<StaffIdentity | null> {
  if (!databaseConfigured) {
    if (!(await hasValidAdminSession())) return null;
    const mock = DEVELOPMENT_STAFF[developmentStaffEmail] ?? DEVELOPMENT_STAFF["admin@hispafly.local"];
    return { id: "development-staff", ...mock };
  }

  try {
    const session = await getCurrentStaffSession();
    if (!session) return null;
    const [staff, credential] = await Promise.all([
      prisma.staffUser.findUnique({
        where: { id: session.staffUserId },
        include: {
          roleTemplate: { include: { permissions: { include: { permission: true } } } },
          permissionOverrides: { include: { permission: true } },
        },
      }),
      getStaffCredential(session.staffUserId),
    ]);
    if (!staff || !staff.active || staff.disabledAt || staff.roleTemplate?.active === false) return null;
    const { resolvePermissionCodes } = await import("./access/resolve");
    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      active: staff.active,
      staffCode: staff.staffCode,
      roleTemplateCode: staff.roleTemplate?.code,
      roleTemplateName: staff.roleTemplate?.name,
      isSystemOwner: staff.isSystemOwner,
      mustChangePassword: credential?.mustChangePassword ?? false,
      sessionId: session.id,
      permissions: [
        ...resolvePermissionCodes({
          legacyRole: staff.role,
          isSystemOwner: staff.isSystemOwner,
          rolePermissions: staff.roleTemplate?.permissions.map((item) => item.permission.code),
          overrides: staff.permissionOverrides.map((item) => ({ code: item.permission.code, effect: item.effect })),
        }),
      ],
    };
  } catch (error) {
    console.error("Unable to resolve the current AOC staff identity.", error);
    return null;
  }
}
