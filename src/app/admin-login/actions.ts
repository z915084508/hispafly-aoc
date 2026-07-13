"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { authenticateStaff } from "@/lib/staff/auth/authenticate";
import { createStaffSession, getStaffRequestContext, revokeCurrentStaffSession } from "@/lib/staff/auth/session";
import { recordStaffLoginSuccess } from "@/lib/staff/auth/credentials";
import { clearAdminSession, setAdminSession, validateAdminCredentials } from "@/lib/staff/adminSession";
import { adminStaffEmail, databaseConfigured } from "@/lib/staff/currentStaff";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function safeNextPath(value: string) {
  return value.startsWith("/staff") ? value : "/staff";
}

async function loginWithLegacyRecovery(identifier: string, password: string) {
  if (!validateAdminCredentials(identifier, password)) return null;
  if (!databaseConfigured) {
    await setAdminSession();
    return { mustChangePassword: false };
  }

  const ownerEmail = process.env.AOC_OWNER_EMAIL?.trim().toLowerCase();
  const targetEmail = ownerEmail || adminStaffEmail;
  const staff = await prisma.staffUser.findFirst({
    where: { email: { equals: targetEmail, mode: "insensitive" }, active: true, disabledAt: null },
  });
  if (!staff) return null;

  const context = await getStaffRequestContext();
  await recordStaffLoginSuccess(staff.id, context.ipAddress, context.userAgent);
  await createStaffSession(staff.id, context);
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: staff.id,
      action: "BREAK_GLASS_LOGIN_USED",
      entityType: "StaffUser",
      entityId: staff.id,
      message: "The legacy administrator recovery login was used.",
      metadata: { ipAddress: context.ipAddress },
    },
  });
  return { mustChangePassword: false };
}

export async function loginAdmin(formData: FormData) {
  const identifier = text(formData, "identifier") || text(formData, "username");
  const password = text(formData, "password");
  const next = safeNextPath(text(formData, "next"));

  const result = databaseConfigured ? await authenticateStaff(identifier, password) : { ok: false as const, reason: "invalid" as const };
  if (result.ok) {
    redirect(result.mustChangePassword ? "/staff/account/change-password" : next);
  }

  const recovery = await loginWithLegacyRecovery(identifier, password);
  if (recovery) redirect(next);

  const error = result.reason === "locked" ? "account_locked" : "invalid_credentials";
  redirect(`/admin-login?error=${error}&next=${encodeURIComponent(next)}`);
}

export async function logoutAdmin() {
  if (databaseConfigured) await revokeCurrentStaffSession("logout");
  await clearAdminSession();
  redirect("/admin-login?success=logged_out");
}
