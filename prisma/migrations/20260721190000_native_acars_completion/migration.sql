ALTER TABLE "Pirep" ALTER COLUMN "vamsysPirepId" DROP NOT NULL;
ALTER TABLE "Pirep" ADD COLUMN "acarsSessionId" TEXT;
CREATE UNIQUE INDEX "Pirep_acarsSessionId_key" ON "Pirep"("acarsSessionId");
ALTER TABLE "Pirep" ADD CONSTRAINT "Pirep_acarsSessionId_fkey" FOREIGN KEY ("acarsSessionId") REFERENCES "AcarsSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
