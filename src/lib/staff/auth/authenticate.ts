import "server-only";

import { prisma } from "@/lib/prisma";
import { FAKE_PASSWORD_HASH, verifyStaffPassword } from "./password";
import { getStaffCredential, recordStaffLoginFailure, recordStaffLoginSuccess } from "./credentials";
import { createStaffSession, getStaffRequestContext } from "./session";

export type StaffLoginResult =
  | { ok: true; staffUserId: string; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" | "locked" };

function normalizeIdentifier(identifier: string) {
  const value = identifier.trim();
  return { email: value.toLowerCase(), staffCode: value.toUpperCase() };
}

export async function authenticateStaff(identifier: string, password: string): Promise<StaffLoginResult> {
  const normalized = normalizeIdentifier(identifier);
  const staff = await prisma.staffUser.findFirst({
    where: {
      OR: [
        { email: { equals: normalized.email, mode: "insensitive" } },
        { staffCode: { equals: normalized.staffCode, mode: "insensitive" } },
      ],
    },
    include: { roleTemplate: true },
  });

  if (!staff) {
    await verifyStaffPassword(password, FAKE_PASSWORD_HASH);
    return { ok: false, reason: "invalid" };
  }

  const credential = await getStaffCredential(staff.id);
  const hashToVerify = credential?.passwordHash ?? FAKE_PASSWORD_HASH;

  if (!staff.active || staff.disabledAt || staff.roleTemplate?.active === false || !credential?.passwordHash) {
    await verifyStaffPassword(password, hashToVerify);
    return { ok: false, reason: "invalid" };
  }

  if (credential.lockedUntil && credential.lockedUntil > new Date()) {
    await verifyStaffPassword(password, hashToVerify);
    return { ok: false, reason: "locked" };
  }

  const valid = await verifyStaffPassword(password, hashToVerify);
  const context = await getStaffRequestContext();
  if (!valid) {
    const failure = await recordStaffLoginFailure(staff.id, credential.failedLoginCount);
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: staff.id,
        action: failure.lockedUntil ? "STAFF_ACCOUNT_LOCKED" : "STAFF_LOGIN_FAILED",
        entityType: "StaffUser",
        entityId: staff.id,
        message: failure.lockedUntil ? "Staff account was temporarily locked after repeated failed sign-ins." : "A Staff sign-in attempt failed.",
        metadata: { failedLoginCount: failure.failedLoginCount, ipAddress: context.ipAddress },
      },
    });
    return { ok: false, reason: failure.lockedUntil ? "locked" : "invalid" };
  }

  await recordStaffLoginSuccess(staff.id, context.ipAddress, context.userAgent);
  await createStaffSession(staff.id, context);
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: staff.id,
      action: "STAFF_LOGIN_SUCCEEDED",
      entityType: "StaffUser",
      entityId: staff.id,
      message: `${staff.name} signed in to the Staff portal.`,
      metadata: { staffCode: staff.staffCode, ipAddress: context.ipAddress },
    },
  });

  return { ok: true, staffUserId: staff.id, mustChangePassword: credential.mustChangePassword };
}
