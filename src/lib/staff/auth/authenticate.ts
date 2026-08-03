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
  const candidates = await prisma.staffUser.findMany({
    where: {
      OR: [
        { email: { equals: normalized.email, mode: "insensitive" } },
        { staffCode: { equals: normalized.staffCode, mode: "insensitive" } },
      ],
    },
    include: { roleTemplate: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  if (candidates.length === 0) {
    await verifyStaffPassword(password, FAKE_PASSWORD_HASH);
    return { ok: false, reason: "invalid" };
  }

  const now = new Date();
  const evaluated: Array<{
    staff: (typeof candidates)[number];
    credential: Awaited<ReturnType<typeof getStaffCredential>>;
    passwordMatches: boolean;
    eligible: boolean;
    locked: boolean;
  }> = [];

  // PostgreSQL's normal unique email index is case-sensitive. Historical imports can
  // therefore leave two Staff rows such as OPS@HISPAFLY.ES and ops@hispafly.es.
  // Verify every case-insensitive candidate so a password reset on the intended row
  // cannot be shadowed by whichever duplicate findFirst happened to return.
  for (const staff of candidates) {
    const credential = await getStaffCredential(staff.id);
    const passwordMatches = await verifyStaffPassword(password, credential?.passwordHash ?? FAKE_PASSWORD_HASH);
    const eligible = staff.active && !staff.disabledAt && staff.roleTemplate?.active !== false && Boolean(credential?.passwordHash);
    const locked = Boolean(credential?.lockedUntil && credential.lockedUntil > now);
    evaluated.push({ staff, credential, passwordMatches, eligible, locked });
  }

  const successful = evaluated.find((candidate) => candidate.eligible && !candidate.locked && candidate.passwordMatches);
  if (successful) {
    const context = await getStaffRequestContext();
    await recordStaffLoginSuccess(successful.staff.id, context.ipAddress, context.userAgent);
    await createStaffSession(successful.staff.id, context);
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: successful.staff.id,
        action: "STAFF_LOGIN_SUCCEEDED",
        entityType: "StaffUser",
        entityId: successful.staff.id,
        message: `${successful.staff.name} signed in to the Staff portal.`,
        metadata: {
          staffCode: successful.staff.staffCode,
          ipAddress: context.ipAddress,
          identifierCandidateCount: candidates.length,
        },
      },
    });

    return {
      ok: true,
      staffUserId: successful.staff.id,
      mustChangePassword: successful.credential?.mustChangePassword ?? false,
    };
  }

  // Preserve the existing lockout behavior, but only after checking whether another
  // duplicate identity has a valid, unlocked credential.
  if (evaluated.some((candidate) => candidate.eligible && candidate.locked)) {
    return { ok: false, reason: "locked" };
  }

  const failureTarget = evaluated.find((candidate) => candidate.eligible && Boolean(candidate.credential?.passwordHash));
  if (!failureTarget) return { ok: false, reason: "invalid" };

  const context = await getStaffRequestContext();
  const failure = await recordStaffLoginFailure(failureTarget.staff.id, failureTarget.credential?.failedLoginCount ?? 0);
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: failureTarget.staff.id,
      action: failure.lockedUntil ? "STAFF_ACCOUNT_LOCKED" : "STAFF_LOGIN_FAILED",
      entityType: "StaffUser",
      entityId: failureTarget.staff.id,
      message: failure.lockedUntil ? "Staff account was temporarily locked after repeated failed sign-ins." : "A Staff sign-in attempt failed.",
      metadata: {
        failedLoginCount: failure.failedLoginCount,
        ipAddress: context.ipAddress,
        identifierCandidateCount: candidates.length,
      },
    },
  });

  return { ok: false, reason: failure.lockedUntil ? "locked" : "invalid" };
}
