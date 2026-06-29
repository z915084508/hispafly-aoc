-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'operations', 'payroll', 'viewer');

-- CreateEnum
CREATE TYPE "PilotStatus" AS ENUM ('active', 'on_leave', 'inactive');

-- CreateEnum
CREATE TYPE "PayrollRecordStatus" AS ENUM ('pending', 'approved', 'rejected', 'paid');

-- CreateEnum
CREATE TYPE "PirepStatus" AS ENUM ('accepted', 'rejected');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('payroll', 'bonus', 'penalty', 'manual_adjustment');

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'operations',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pilot" (
    "id" TEXT NOT NULL,
    "vamsysPilotId" TEXT NOT NULL,
    "callsign" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "rank" TEXT,
    "base" TEXT,
    "status" "PilotStatus" NOT NULL DEFAULT 'active',
    "walletBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VamsysOAuthToken" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'vamsys',
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VamsysOAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pirep" (
    "id" TEXT NOT NULL,
    "vamsysPirepId" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "departure" TEXT NOT NULL,
    "arrival" TEXT NOT NULL,
    "aircraftType" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "flightTimeMinutes" INTEGER NOT NULL,
    "blockTimeMinutes" INTEGER NOT NULL,
    "landingRate" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "fuelUsed" INTEGER NOT NULL,
    "status" "PirepStatus" NOT NULL,
    "flownAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "synchronizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pirep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL,
    "pirepId" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "payrollRuleId" TEXT,
    "basePayCents" INTEGER NOT NULL,
    "bonusCents" INTEGER NOT NULL DEFAULT 0,
    "penaltyCents" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "calculationDetails" JSONB,
    "status" "PayrollRecordStatus" NOT NULL DEFAULT 'pending',
    "settlementMonth" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "payrollRecordId" TEXT,
    "type" "WalletTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "aircraftRates" JSONB NOT NULL,
    "bonusRules" JSONB,
    "penaltyRules" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AocAuditLog" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AocAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_vamsysPilotId_key" ON "Pilot"("vamsysPilotId");

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_callsign_key" ON "Pilot"("callsign");

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_email_key" ON "Pilot"("email");

-- CreateIndex
CREATE INDEX "Pilot_status_idx" ON "Pilot"("status");

-- CreateIndex
CREATE INDEX "Pilot_base_idx" ON "Pilot"("base");

-- CreateIndex
CREATE UNIQUE INDEX "VamsysOAuthToken_provider_key" ON "VamsysOAuthToken"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Pirep_vamsysPirepId_key" ON "Pirep"("vamsysPirepId");

-- CreateIndex
CREATE INDEX "Pirep_pilotId_flownAt_idx" ON "Pirep"("pilotId", "flownAt");

-- CreateIndex
CREATE INDEX "Pirep_status_flownAt_idx" ON "Pirep"("status", "flownAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRecord_pirepId_key" ON "PayrollRecord"("pirepId");

-- CreateIndex
CREATE INDEX "PayrollRecord_pilotId_status_idx" ON "PayrollRecord"("pilotId", "status");

-- CreateIndex
CREATE INDEX "PayrollRecord_status_settlementMonth_idx" ON "PayrollRecord"("status", "settlementMonth");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_payrollRecordId_key" ON "WalletTransaction"("payrollRecordId");

-- CreateIndex
CREATE INDEX "WalletTransaction_pilotId_createdAt_idx" ON "WalletTransaction"("pilotId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- CreateIndex
CREATE INDEX "PayrollRule_isActive_effectiveFrom_idx" ON "PayrollRule"("isActive", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRule_name_version_key" ON "PayrollRule"("name", "version");

-- CreateIndex
CREATE INDEX "AocAuditLog_staffUserId_createdAt_idx" ON "AocAuditLog"("staffUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AocAuditLog_entityType_entityId_idx" ON "AocAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AocAuditLog_action_idx" ON "AocAuditLog"("action");

-- AddForeignKey
ALTER TABLE "Pirep" ADD CONSTRAINT "Pirep_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_pirepId_fkey" FOREIGN KEY ("pirepId") REFERENCES "Pirep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_payrollRuleId_fkey" FOREIGN KEY ("payrollRuleId") REFERENCES "PayrollRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "PayrollRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AocAuditLog" ADD CONSTRAINT "AocAuditLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
