CREATE TYPE "AuthUserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'LOCKED', 'PENDING_VERIFICATION');
CREATE TABLE "AuthUser" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "username" TEXT NOT NULL, "passwordHash" TEXT, "displayName" TEXT NOT NULL,
  "status" "AuthUserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION', "emailVerifiedAt" TIMESTAMP(3),
  "passwordChangedAt" TIMESTAMP(3), "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");
CREATE UNIQUE INDEX "AuthUser_username_key" ON "AuthUser"("username");
CREATE INDEX "AuthUser_status_idx" ON "AuthUser"("status");

CREATE TABLE "AuthRole" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "systemRole" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AuthRole_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AuthRole_code_key" ON "AuthRole"("code");
CREATE TABLE "AuthPermission" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthPermission_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AuthPermission_code_key" ON "AuthPermission"("code");
CREATE TABLE "AuthUserRole" ("userId" TEXT NOT NULL, "roleId" TEXT NOT NULL, "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthUserRole_pkey" PRIMARY KEY ("userId","roleId"));
CREATE INDEX "AuthUserRole_roleId_idx" ON "AuthUserRole"("roleId");
CREATE TABLE "AuthRolePermission" ("roleId" TEXT NOT NULL, "permissionId" TEXT NOT NULL,
  CONSTRAINT "AuthRolePermission_pkey" PRIMARY KEY ("roleId","permissionId"));
CREATE INDEX "AuthRolePermission_permissionId_idx" ON "AuthRolePermission"("permissionId");
CREATE TABLE "AuthSession" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ipAddress" TEXT, "userAgent" TEXT, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId","expiresAt");
CREATE TABLE "PasswordResetToken" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId","expiresAt");
CREATE TABLE "EmailVerificationToken" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId","expiresAt");

ALTER TABLE "Pilot" ADD COLUMN "authUserId" TEXT;
ALTER TABLE "Pilot" ALTER COLUMN "vamsysPilotId" DROP NOT NULL;
CREATE UNIQUE INDEX "Pilot_authUserId_key" ON "Pilot"("authUserId");
ALTER TABLE "Pilot" ADD CONSTRAINT "Pilot_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuthUserRole" ADD CONSTRAINT "AuthUserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthUserRole" ADD CONSTRAINT "AuthUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AuthRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthRolePermission" ADD CONSTRAINT "AuthRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AuthRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthRolePermission" ADD CONSTRAINT "AuthRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "AuthPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AuthRole" ("id","code","name","description","systemRole","updatedAt") VALUES
('role_pilot','PILOT','Pilot','Pilot Portal access',true,CURRENT_TIMESTAMP),
('role_admin','ADMIN','Administrator','Full platform administration',true,CURRENT_TIMESTAMP),
('role_staff','STAFF','Staff','General staff access',true,CURRENT_TIMESTAMP),
('role_dispatcher','DISPATCHER','Dispatcher','Flight dispatch access',true,CURRENT_TIMESTAMP),
('role_occ','OCC','OCC','Operations control access',true,CURRENT_TIMESTAMP),
('role_fleet_manager','FLEET_MANAGER','Fleet Manager','Fleet management access',true,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
