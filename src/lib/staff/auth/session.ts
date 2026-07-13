import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getStaffCredential } from "./credentials";

export const STAFF_SESSION_COOKIE = "hispafly_aoc_staff_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export interface StaffSessionRecord {
  id: string;
  staffUserId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getStaffRequestContext() {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || requestHeaders.get("x-real-ip") || null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) || null,
  };
}

export async function createStaffSession(
  staffUserId: string,
  context?: { ipAddress?: string | null; userAgent?: string | null },
) {
  const rawToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.$executeRaw`
    INSERT INTO "StaffSession" (
      "id", "staffUserId", "tokenHash", "expiresAt", "ipAddress", "userAgent"
    ) VALUES (
      ${id}, ${staffUserId}, ${tokenHash(rawToken)}, ${expiresAt},
      ${context?.ipAddress ?? null}, ${context?.userAgent ?? null}
    )
  `;
  const cookieStore = await cookies();
  cookieStore.set(STAFF_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return { id, expiresAt };
}

export async function getCurrentStaffSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  const rows = await prisma.$queryRaw<StaffSessionRecord[]>`
    SELECT * FROM "StaffSession"
    WHERE "tokenHash" = ${tokenHash(rawToken)}
    LIMIT 1
  `;
  const session = rows[0];
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

  const credential = await getStaffCredential(session.staffUserId);
  if (credential?.passwordChangedAt && credential.passwordChangedAt > session.createdAt) return null;

  if (Date.now() - session.lastSeenAt.getTime() > 15 * 60 * 1000) {
    await prisma.$executeRaw`
      UPDATE "StaffSession" SET "lastSeenAt" = NOW() WHERE "id" = ${session.id}
    `;
  }
  return session;
}

export async function revokeStaffSession(sessionId: string, reason: string) {
  await prisma.$executeRaw`
    UPDATE "StaffSession"
    SET "revokedAt" = COALESCE("revokedAt", NOW()), "revokedReason" = ${reason}
    WHERE "id" = ${sessionId}
  `;
}

export async function revokeAllStaffSessions(staffUserId: string, reason: string, exceptSessionId?: string) {
  if (exceptSessionId) {
    await prisma.$executeRaw`
      UPDATE "StaffSession"
      SET "revokedAt" = COALESCE("revokedAt", NOW()), "revokedReason" = ${reason}
      WHERE "staffUserId" = ${staffUserId} AND "id" <> ${exceptSessionId} AND "revokedAt" IS NULL
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "StaffSession"
      SET "revokedAt" = COALESCE("revokedAt", NOW()), "revokedReason" = ${reason}
      WHERE "staffUserId" = ${staffUserId} AND "revokedAt" IS NULL
    `;
  }
}

export async function revokeCurrentStaffSession(reason = "logout") {
  const session = await getCurrentStaffSession();
  if (session) await revokeStaffSession(session.id, reason);
  await clearStaffSessionCookie();
  return session;
}

export async function clearStaffSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(STAFF_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
