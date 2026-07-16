CREATE TYPE "NativeCutoverClassification" AS ENUM ('NATIVE_READY', 'LEGACY_LINKED', 'LEGACY_UNRESOLVED', 'LEGACY_HISTORICAL_ONLY', 'INVALID_REQUIRES_REVIEW');
CREATE TYPE "NativeCutoverReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'HISTORICAL_ONLY', 'RESOLVED');
CREATE TYPE "NativeCutoverOperationStatus" AS ENUM ('PREVIEWED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'ROLLED_BACK');

ALTER TABLE "FlightOffer" ALTER COLUMN "vamsysRouteId" DROP NOT NULL;
ALTER TABLE "FlightOffer" ALTER COLUMN "vamsysAircraftId" DROP NOT NULL;

CREATE TABLE "NativeCutoverReviewItem" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "classification" "NativeCutoverClassification" NOT NULL,
  "issueType" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "candidateTargets" JSONB,
  "proposedTargetId" TEXT,
  "matchingReason" TEXT,
  "confidence" TEXT,
  "affectedFields" TEXT[],
  "downstreamImpact" JSONB,
  "warnings" TEXT[],
  "status" "NativeCutoverReviewStatus" NOT NULL DEFAULT 'PENDING',
  "resolutionNote" TEXT,
  "resolvedTargetId" TEXT,
  "resolvedByStaffId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NativeCutoverReviewItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NativeCutoverReviewItem_entityType_sourceId_issueType_key" ON "NativeCutoverReviewItem"("entityType", "sourceId", "issueType");
CREATE INDEX "NativeCutoverReviewItem_entityType_status_idx" ON "NativeCutoverReviewItem"("entityType", "status");
CREATE INDEX "NativeCutoverReviewItem_classification_status_idx" ON "NativeCutoverReviewItem"("classification", "status");

CREATE TABLE "NativeCutoverOperation" (
  "id" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "actorStaffId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" "NativeCutoverOperationStatus" NOT NULL DEFAULT 'PREVIEWED',
  "requestedIds" TEXT[],
  "succeeded" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NativeCutoverOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NativeCutoverOperation_operationKey_key" ON "NativeCutoverOperation"("operationKey");
CREATE INDEX "NativeCutoverOperation_entityType_createdAt_idx" ON "NativeCutoverOperation"("entityType", "createdAt");
CREATE INDEX "NativeCutoverOperation_status_createdAt_idx" ON "NativeCutoverOperation"("status", "createdAt");

CREATE TABLE "NativeCutoverOperationEntry" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "reviewItemId" TEXT,
  "entityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetNativeId" TEXT,
  "action" TEXT NOT NULL,
  "matchingReason" TEXT,
  "beforeValue" JSONB,
  "afterValue" JSONB,
  "result" TEXT NOT NULL,
  "errorMessage" TEXT,
  "reversible" BOOLEAN NOT NULL DEFAULT true,
  "rolledBackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeCutoverOperationEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NativeCutoverOperationEntry_operationId_entityType_sourceId_action_key" ON "NativeCutoverOperationEntry"("operationId", "entityType", "sourceId", "action");
CREATE INDEX "NativeCutoverOperationEntry_reviewItemId_idx" ON "NativeCutoverOperationEntry"("reviewItemId");
CREATE INDEX "NativeCutoverOperationEntry_sourceId_createdAt_idx" ON "NativeCutoverOperationEntry"("sourceId", "createdAt");
ALTER TABLE "NativeCutoverOperationEntry" ADD CONSTRAINT "NativeCutoverOperationEntry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "NativeCutoverOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
