-- Additive migration: legacy evidence remains intact and is not retroactively penalized.
ALTER TABLE "AcarsSession" ADD COLUMN "operationalEventBuffer" JSONB;
ALTER TABLE "OperationalEvent"
 ADD COLUMN "episodeId" TEXT,
 ADD COLUMN "ruleCode" TEXT,
 ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
 ADD COLUMN "startedAt" TIMESTAMP(3),
 ADD COLUMN "confirmedAt" TIMESTAMP(3),
 ADD COLUMN "endedAt" TIMESTAMP(3),
 ADD COLUMN "durationSeconds" DOUBLE PRECISION,
 ADD COLUMN "value" DOUBLE PRECISION,
 ADD COLUMN "peakValue" DOUBLE PRECISION,
 ADD COLUMN "endValue" DOUBLE PRECISION,
 ADD COLUMN "threshold" DOUBLE PRECISION,
 ADD COLUMN "scoreEligible" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "scoreImpact" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "originalImpact" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "confidence" DOUBLE PRECISION,
 ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "dispositionReason" TEXT,
 ADD COLUMN "reviewedById" TEXT,
 ADD COLUMN "reviewedByName" TEXT,
 ADD COLUMN "reviewedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "OperationalEvent_pirepId_eventType_episodeId_key" ON "OperationalEvent"("pirepId", "eventType", "episodeId");
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_status_check" CHECK ("status" IN ('CONFIRMED','DISMISSED','SUPPRESSED','DATA_QUALITY'));
