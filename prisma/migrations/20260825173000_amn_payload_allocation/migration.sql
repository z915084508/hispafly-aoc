ALTER TABLE "PilotBooking"
  ADD COLUMN "amnPayloadRequestId" TEXT,
  ADD COLUMN "amnMarketSnapshotId" TEXT,
  ADD COLUMN "amnPayloadStage" TEXT,
  ADD COLUMN "amnPayloadProvenance" JSONB;

CREATE UNIQUE INDEX "PilotBooking_amnPayloadRequestId_key"
  ON "PilotBooking"("amnPayloadRequestId");
