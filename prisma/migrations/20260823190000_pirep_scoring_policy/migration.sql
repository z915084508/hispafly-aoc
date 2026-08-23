ALTER TABLE "Pirep" ADD COLUMN "scoringDetails" JSONB;

CREATE TABLE "PirepScoringPolicy" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "fleetId" TEXT,
  "name" TEXT NOT NULL,
  "operationalWeight" INTEGER NOT NULL DEFAULT 70,
  "efficiencyWeight" INTEGER NOT NULL DEFAULT 30,
  "startingScore" INTEGER NOT NULL DEFAULT 100,
  "rules" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PirepScoringPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PirepScoringPolicy_scopeKey_key" ON "PirepScoringPolicy"("scopeKey");
CREATE INDEX "PirepScoringPolicy_fleetId_active_idx" ON "PirepScoringPolicy"("fleetId", "active");

INSERT INTO "PirepScoringPolicy" ("id", "scopeKey", "name", "rules", "updatedAt") VALUES
('pirep-scoring-global', 'GLOBAL', 'HISPAFLY default', '[{"code":"TAXI_OVERSPEED","label":"Taxi speed above 30 kt","category":"OPERATIONAL","action":"DEDUCT","points":10,"enabled":true},{"code":"OVERSPEED","label":"Speed above 250 kt below FL100","category":"OPERATIONAL","action":"DEDUCT","points":10,"enabled":true},{"code":"GO_AROUND","label":"Go-around","category":"OPERATIONAL","action":"NONE","points":0,"enabled":true},{"code":"MID_AIR_REFUELING","label":"Mid-air refueling","category":"INTEGRITY","action":"INVALIDATE","points":0,"enabled":true},{"code":"TIME_ACCELERATION","label":"Time acceleration","category":"INTEGRITY","action":"REVIEW","points":0,"enabled":true}]'::jsonb, CURRENT_TIMESTAMP);

UPDATE "PirepScoringPolicy" SET "rules" = "rules" || '[{"code":"HARD_LANDING","label":"Hard landing","category":"OPERATIONAL","action":"DEDUCT","points":15,"enabled":true}]'::jsonb WHERE "scopeKey" = 'GLOBAL';
