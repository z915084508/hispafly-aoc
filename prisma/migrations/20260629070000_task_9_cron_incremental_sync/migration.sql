ALTER TABLE "OperationsApiState"
  ADD COLUMN "lastPirepSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastCronPirepSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastCronPilotSyncAt" TIMESTAMP(3);
