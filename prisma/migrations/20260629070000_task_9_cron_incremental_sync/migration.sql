CREATE TABLE IF NOT EXISTS "OperationsApiState" (
  "id" TEXT NOT NULL DEFAULT 'vamsys',
  "status" TEXT NOT NULL DEFAULT 'unknown',
  "lastCheckedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastPilotSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsApiState_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OperationsApiState"
  ADD COLUMN IF NOT EXISTS "lastPirepSyncAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCronPirepSyncAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCronPilotSyncAt" TIMESTAMP(3);
