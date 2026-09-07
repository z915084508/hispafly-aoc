CREATE TABLE "PilotRiskFlag" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "signalKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "confirmedAt" TIMESTAMP(3),
  "confirmedByStaffId" TEXT,
  "dismissedAt" TIMESTAMP(3),
  "dismissedByStaffId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByStaffId" TEXT,
  "resolutionComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotRiskFlag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PilotRiskFlag_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PilotRiskFlag_pilotId_status_severity_idx" ON "PilotRiskFlag"("pilotId", "status", "severity");
CREATE INDEX "PilotRiskFlag_status_severity_lastDetectedAt_idx" ON "PilotRiskFlag"("status", "severity", "lastDetectedAt");
CREATE INDEX "PilotRiskFlag_source_category_idx" ON "PilotRiskFlag"("source", "category");
CREATE UNIQUE INDEX "PilotRiskFlag_active_signal_key" ON "PilotRiskFlag"("pilotId", "signalKey") WHERE "status" IN ('OPEN', 'CONFIRMED');
