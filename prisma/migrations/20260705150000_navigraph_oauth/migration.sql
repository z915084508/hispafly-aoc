CREATE TABLE "NavigraphOAuthToken" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "navigraphUserId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NavigraphOAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NavigraphOAuthToken_pilotId_key" ON "NavigraphOAuthToken"("pilotId");
CREATE INDEX "NavigraphOAuthToken_expiresAt_idx" ON "NavigraphOAuthToken"("expiresAt");
CREATE INDEX "NavigraphOAuthToken_revokedAt_idx" ON "NavigraphOAuthToken"("revokedAt");
ALTER TABLE "NavigraphOAuthToken" ADD CONSTRAINT "NavigraphOAuthToken_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
