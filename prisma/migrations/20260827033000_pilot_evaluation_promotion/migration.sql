CREATE TYPE "EvaluationWindow" AS ENUM ('LAST_10_FLIGHTS', 'LAST_30_FLIGHTS', 'LAST_90_DAYS', 'LAST_12_MONTHS', 'CAREER');
CREATE TYPE "PilotAssessmentType" AS ENUM ('COMMAND', 'LINE_CHECK', 'TRAINING', 'CRM', 'CONDUCT');
CREATE TYPE "AssessmentRecommendation" AS ENUM ('NOT_RECOMMENDED', 'DEVELOPMENT_REQUIRED', 'RECOMMENDED', 'STRONGLY_RECOMMENDED');
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_EVIDENCE_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED');
CREATE TYPE "PromotionEligibilityStatus" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED');
CREATE TYPE "PromotionReviewDecision" AS ENUM ('RECOMMEND', 'DO_NOT_RECOMMEND', 'REQUEST_MORE_EVIDENCE', 'APPROVE', 'REJECT');

CREATE TABLE "PilotEvaluationPeriod" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "windowType" "EvaluationWindow" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "overallScore" INTEGER,
  "safetyScore" INTEGER,
  "sopScore" INTEGER,
  "operationsScore" INTEGER,
  "reliabilityScore" INTEGER,
  "commandReadinessScore" INTEGER,
  "acceptedFlights" INTEGER NOT NULL DEFAULT 0,
  "rejectedFlights" INTEGER NOT NULL DEFAULT 0,
  "manualReviewFlights" INTEGER NOT NULL DEFAULT 0,
  "majorEvents" INTEGER NOT NULL DEFAULT 0,
  "criticalEvents" INTEGER NOT NULL DEFAULT 0,
  "noShowCount" INTEGER NOT NULL DEFAULT 0,
  "calculationVersion" INTEGER NOT NULL DEFAULT 1,
  "evidenceSnapshot" JSONB NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),
  "finalizedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotEvaluationPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotAssessment" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "assessmentType" "PilotAssessmentType" NOT NULL,
  "commandScore" INTEGER,
  "crmScore" INTEGER,
  "sopKnowledgeScore" INTEGER,
  "conductScore" INTEGER,
  "recommendation" "AssessmentRecommendation" NOT NULL,
  "comment" TEXT NOT NULL,
  "assessedByStaffId" TEXT NOT NULL,
  "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotPromotionCase" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "fromRank" TEXT NOT NULL,
  "targetRank" TEXT NOT NULL,
  "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "eligibilityStatus" "PromotionEligibilityStatus" NOT NULL,
  "eligibilitySnapshot" JSONB NOT NULL,
  "evaluationPeriodId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedByPilotId" TEXT,
  "openedByStaffId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decidedByStaffId" TEXT,
  "decisionReason" TEXT,
  "effectiveAt" TIMESTAMP(3),
  "previousRankSnapshot" JSONB,
  "resultingRankSnapshot" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotPromotionCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotPromotionReview" (
  "id" TEXT NOT NULL,
  "promotionCaseId" TEXT NOT NULL,
  "reviewerStaffId" TEXT NOT NULL,
  "decision" "PromotionReviewDecision" NOT NULL,
  "comment" TEXT NOT NULL,
  "evidenceSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotPromotionReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotQualificationRestriction" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "blocksPromotion" BOOLEAN NOT NULL DEFAULT true,
  "blocksDispatch" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdByStaffId" TEXT NOT NULL,
  "resolvedByStaffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotQualificationRestriction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PilotEvaluationPeriod_pilotId_windowType_periodEnd_calcul_key" ON "PilotEvaluationPeriod"("pilotId", "windowType", "periodEnd", "calculationVersion");
CREATE INDEX "PilotEvaluationPeriod_pilotId_windowType_calculatedAt_idx" ON "PilotEvaluationPeriod"("pilotId", "windowType", "calculatedAt");
CREATE INDEX "PilotAssessment_pilotId_assessmentType_assessedAt_idx" ON "PilotAssessment"("pilotId", "assessmentType", "assessedAt");
CREATE INDEX "PilotAssessment_validUntil_idx" ON "PilotAssessment"("validUntil");
CREATE INDEX "PilotPromotionCase_pilotId_status_requestedAt_idx" ON "PilotPromotionCase"("pilotId", "status", "requestedAt");
CREATE INDEX "PilotPromotionCase_status_requestedAt_idx" ON "PilotPromotionCase"("status", "requestedAt");
CREATE UNIQUE INDEX "PilotPromotionReview_promotionCaseId_reviewerStaffId_key" ON "PilotPromotionReview"("promotionCaseId", "reviewerStaffId");
CREATE INDEX "PilotPromotionReview_reviewerStaffId_createdAt_idx" ON "PilotPromotionReview"("reviewerStaffId", "createdAt");
CREATE INDEX "PilotQualificationRestriction_pilotId_resolvedAt_expires_idx" ON "PilotQualificationRestriction"("pilotId", "resolvedAt", "expiresAt");
CREATE INDEX "PilotQualificationRestriction_blocksPromotion_resolvedAt_idx" ON "PilotQualificationRestriction"("blocksPromotion", "resolvedAt");

ALTER TABLE "PilotEvaluationPeriod" ADD CONSTRAINT "PilotEvaluationPeriod_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotAssessment" ADD CONSTRAINT "PilotAssessment_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotPromotionCase" ADD CONSTRAINT "PilotPromotionCase_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotPromotionCase" ADD CONSTRAINT "PilotPromotionCase_evaluationPeriodId_fkey" FOREIGN KEY ("evaluationPeriodId") REFERENCES "PilotEvaluationPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotPromotionReview" ADD CONSTRAINT "PilotPromotionReview_promotionCaseId_fkey" FOREIGN KEY ("promotionCaseId") REFERENCES "PilotPromotionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotQualificationRestriction" ADD CONSTRAINT "PilotQualificationRestriction_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
