ALTER TYPE "PirepStatus" ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE "PirepStatus" ADD VALUE IF NOT EXISTS 'validation';
ALTER TYPE "PirepStatus" ADD VALUE IF NOT EXISTS 'manual_review';

CREATE TYPE "PirepRejectCode" AS ENUM ('R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08');

ALTER TABLE "Pirep"
  ADD COLUMN "rejectCode" "PirepRejectCode",
  ADD COLUMN "staffComment" TEXT,
  ADD COLUMN "reviewedByStaffId" TEXT,
  ADD COLUMN "reviewedByName" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAfterReviewAt" TIMESTAMP(3),
  ADD COLUMN "reviewSettlementState" JSONB;

CREATE TABLE "PirepReview" (
  "id" TEXT NOT NULL,
  "pirepId" TEXT NOT NULL,
  "fromStatus" "PirepStatus" NOT NULL,
  "toStatus" "PirepStatus" NOT NULL,
  "rejectCode" "PirepRejectCode",
  "staffComment" TEXT,
  "reviewerStaffId" TEXT,
  "reviewerName" TEXT NOT NULL,
  "automatic" BOOLEAN NOT NULL DEFAULT false,
  "impact" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PirepReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PirepReview_pirepId_createdAt_idx" ON "PirepReview"("pirepId", "createdAt");
CREATE INDEX "PirepReview_toStatus_createdAt_idx" ON "PirepReview"("toStatus", "createdAt");
ALTER TABLE "PirepReview" ADD CONSTRAINT "PirepReview_pirepId_fkey" FOREIGN KEY ("pirepId") REFERENCES "Pirep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
