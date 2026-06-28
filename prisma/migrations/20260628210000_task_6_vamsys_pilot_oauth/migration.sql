-- Expand pilot identity fields imported with explicit pilot consent.
ALTER TABLE "Pilot"
ADD COLUMN "vamsysUserId" TEXT,
ADD COLUMN "username" TEXT,
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "vatsimId" TEXT,
ADD COLUMN "ivaoId" TEXT,
ADD COLUMN "discordId" TEXT,
ADD COLUMN "rankName" TEXT,
ADD COLUMN "rankAbbreviation" TEXT,
ADD COLUMN "hubId" TEXT;

CREATE UNIQUE INDEX "Pilot_vamsysUserId_key" ON "Pilot"("vamsysUserId");

-- The legacy global token model was never used. Replace it with one server-side token per pilot.
DROP TABLE "VamsysOAuthToken";

CREATE TABLE "VamsysOAuthToken" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "scopes" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VamsysOAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VamsysOAuthToken_pilotId_key" ON "VamsysOAuthToken"("pilotId");
CREATE INDEX "VamsysOAuthToken_expiresAt_idx" ON "VamsysOAuthToken"("expiresAt");
CREATE INDEX "VamsysOAuthToken_revokedAt_idx" ON "VamsysOAuthToken"("revokedAt");
ALTER TABLE "VamsysOAuthToken" ADD CONSTRAINT "VamsysOAuthToken_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OAuth lifecycle events are system/pilot events and do not always have a staff actor.
ALTER TABLE "AocAuditLog" DROP CONSTRAINT "AocAuditLog_staffUserId_fkey";
ALTER TABLE "AocAuditLog" ALTER COLUMN "staffUserId" DROP NOT NULL;
ALTER TABLE "AocAuditLog" ADD CONSTRAINT "AocAuditLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
