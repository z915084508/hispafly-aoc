import "server-only";

import { prisma } from "@/lib/prisma";

export interface StaffCredentialRecord {
  staffUserId: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  failedLoginCount: number;
  lastFailedLoginAt: Date | null;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getStaffCredential(staffUserId: string) {
  const rows = await prisma.$queryRaw<StaffCredentialRecord[]>`
    SELECT * FROM "StaffCredential" WHERE "staffUserId" = ${staffUserId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getStaffCredentialStatus(staffUserId: string) {
  const [credential, sessions] = await Promise.all([
    getStaffCredential(staffUserId),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "StaffSession"
      WHERE "staffUserId" = ${staffUserId}
        AND "revokedAt" IS NULL
        AND "expiresAt" > NOW()
    `,
  ]);
  return {
    configured: Boolean(credential?.passwordHash),
    mustChangePassword: credential?.mustChangePassword ?? false,
    lockedUntil: credential?.lockedUntil ?? null,
    lastLoginAt: credential?.lastLoginAt ?? null,
    passwordChangedAt: credential?.passwordChangedAt ?? null,
    activeSessionCount: Number(sessions[0]?.count ?? 0),
  };
}

export async function setTemporaryStaffPassword(staffUserId: string, passwordHash: string) {
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "StaffCredential" (
      "staffUserId", "passwordHash", "mustChangePassword", "passwordChangedAt",
      "failedLoginCount", "lockedUntil", "updatedAt"
    ) VALUES (${staffUserId}, ${passwordHash}, true, ${now}, 0, NULL, ${now})
    ON CONFLICT ("staffUserId") DO UPDATE SET
      "passwordHash" = EXCLUDED."passwordHash",
      "mustChangePassword" = true,
      "passwordChangedAt" = EXCLUDED."passwordChangedAt",
      "failedLoginCount" = 0,
      "lastFailedLoginAt" = NULL,
      "lockedUntil" = NULL,
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export async function changeStaffPassword(staffUserId: string, passwordHash: string) {
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "StaffCredential" (
      "staffUserId", "passwordHash", "mustChangePassword", "passwordChangedAt",
      "failedLoginCount", "lockedUntil", "updatedAt"
    ) VALUES (${staffUserId}, ${passwordHash}, false, ${now}, 0, NULL, ${now})
    ON CONFLICT ("staffUserId") DO UPDATE SET
      "passwordHash" = EXCLUDED."passwordHash",
      "mustChangePassword" = false,
      "passwordChangedAt" = EXCLUDED."passwordChangedAt",
      "failedLoginCount" = 0,
      "lastFailedLoginAt" = NULL,
      "lockedUntil" = NULL,
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export async function recordStaffLoginFailure(staffUserId: string, currentFailures: number) {
  const nextFailures = currentFailures + 1;
  const now = new Date();
  const lockedUntil = nextFailures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null;
  await prisma.$executeRaw`
    INSERT INTO "StaffCredential" (
      "staffUserId", "failedLoginCount", "lastFailedLoginAt", "lockedUntil", "updatedAt"
    ) VALUES (${staffUserId}, ${nextFailures}, ${now}, ${lockedUntil}, ${now})
    ON CONFLICT ("staffUserId") DO UPDATE SET
      "failedLoginCount" = ${nextFailures},
      "lastFailedLoginAt" = ${now},
      "lockedUntil" = ${lockedUntil},
      "updatedAt" = ${now}
  `;
  return { failedLoginCount: nextFailures, lockedUntil };
}

export async function recordStaffLoginSuccess(staffUserId: string, ipAddress?: string | null, userAgent?: string | null) {
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "StaffCredential" (
      "staffUserId", "failedLoginCount", "lastLoginAt", "lastLoginIp", "lastLoginUserAgent", "updatedAt"
    ) VALUES (${staffUserId}, 0, ${now}, ${ipAddress ?? null}, ${userAgent ?? null}, ${now})
    ON CONFLICT ("staffUserId") DO UPDATE SET
      "failedLoginCount" = 0,
      "lastFailedLoginAt" = NULL,
      "lockedUntil" = NULL,
      "lastLoginAt" = ${now},
      "lastLoginIp" = ${ipAddress ?? null},
      "lastLoginUserAgent" = ${userAgent ?? null},
      "updatedAt" = ${now}
  `;
  await prisma.staffUser.update({ where: { id: staffUserId }, data: { lastLoginAt: now } });
}

export async function unlockStaffCredential(staffUserId: string) {
  await prisma.$executeRaw`
    UPDATE "StaffCredential"
    SET "failedLoginCount" = 0, "lastFailedLoginAt" = NULL, "lockedUntil" = NULL, "updatedAt" = NOW()
    WHERE "staffUserId" = ${staffUserId}
  `;
}
