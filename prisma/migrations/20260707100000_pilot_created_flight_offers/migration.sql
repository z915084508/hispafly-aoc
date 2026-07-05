ALTER TABLE "FlightOffer" ALTER COLUMN "createdByStaffId" DROP NOT NULL;
ALTER TABLE "FlightOffer" ADD COLUMN "createdByPilotId" TEXT;

CREATE INDEX "FlightOffer_createdByPilotId_createdAt_idx" ON "FlightOffer"("createdByPilotId", "createdAt");

ALTER TABLE "FlightOffer" ADD CONSTRAINT "FlightOffer_createdByPilotId_fkey"
  FOREIGN KEY ("createdByPilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
