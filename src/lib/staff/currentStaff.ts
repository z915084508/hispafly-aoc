import type { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface StaffIdentity {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
}

const DEVELOPMENT_STAFF: Record<string, Omit<StaffIdentity, "id">> = {
  "admin@hispafly.local": { name: "María Administradora", email: "admin@hispafly.local", role: "ADMIN", active: true },
  "ops@hispafly.local": { name: "Óscar Operaciones", email: "ops@hispafly.local", role: "OPS", active: true },
  "finance@hispafly.local": { name: "Carlos Finanzas", email: "finance@hispafly.local", role: "FINANCE", active: true },
  "viewer@hispafly.local": { name: "Vera Consulta", email: "viewer@hispafly.local", role: "VIEWER", active: true },
};

export const developmentStaffEmail = process.env.MOCK_STAFF_EMAIL ?? "admin@hispafly.local";
export const databaseConfigured = Boolean(process.env.DATABASE_URL);

export async function getCurrentStaff(): Promise<StaffIdentity | null> {
  if (!databaseConfigured) {
    const mock = DEVELOPMENT_STAFF[developmentStaffEmail] ?? DEVELOPMENT_STAFF["admin@hispafly.local"];
    return { id: "development-staff", ...mock };
  }

  try {
    return await prisma.staffUser.findUnique({
      where: { email: developmentStaffEmail },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  } catch (error) {
    console.error("Unable to resolve the current AOC staff identity.", error);
    return null;
  }
}
