CREATE TABLE "DispatchRelease" (
  "id" TEXT NOT NULL,
  "ofpBriefingId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "riskLevel" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "ofpCheckStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "fuelCheckStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "aircraftConditionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "takeoffPerformanceStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "landingPerformanceStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "weatherStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "alternateStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "etopsStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "checks" JSONB NOT NULL,
  "warnings" JSONB,
  "blockingItems" JSONB,
  "releasedAt" TIMESTAMP(3),
  "releasedByPilotId" TEXT,
  "releasedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DispatchRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DispatchRelease_ofpBriefingId_key" ON "DispatchRelease"("ofpBriefingId");
CREATE INDEX "DispatchRelease_status_riskLevel_idx" ON "DispatchRelease"("status", "riskLevel");
CREATE INDEX "DispatchRelease_releasedAt_idx" ON "DispatchRelease"("releasedAt");
ALTER TABLE "DispatchRelease" ADD CONSTRAINT "DispatchRelease_ofpBriefingId_fkey" FOREIGN KEY ("ofpBriefingId") REFERENCES "OfpBriefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

