CREATE TABLE "StaffCredential" (
  "staffUserId" TEXT NOT NULL,
  "passwordHash" TEXT,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "passwordChangedAt" TIMESTAMP(3),
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lastFailedLoginAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "lastLoginIp" TEXT,
  "lastLoginUserAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffCredential_pkey" PRIMARY KEY ("staffUserId")
);

CREATE TABLE "StaffSession" (
  "id" TEXT NOT NULL,
  "staffUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");
CREATE INDEX "StaffSession_staffUserId_revokedAt_idx" ON "StaffSession"("staffUserId", "revokedAt");
CREATE INDEX "StaffSession_expiresAt_idx" ON "StaffSession"("expiresAt");

ALTER TABLE "StaffCredential"
  ADD CONSTRAINT "StaffCredential_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffSession"
  ADD CONSTRAINT "StaffSession_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
