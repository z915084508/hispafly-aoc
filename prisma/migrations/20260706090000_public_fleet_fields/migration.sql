ALTER TABLE "Aircraft" ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Aircraft" ADD COLUMN "publicDisplayName" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN "publicDescription" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN "publicImageUrl" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN "publicBaseIcao" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN "publicStatus" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN "publicDisplayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Aircraft" ADD COLUMN "publicPublishedAt" TIMESTAMP(3);

CREATE INDEX "Aircraft_publicVisible_publicDisplayOrder_idx" ON "Aircraft"("publicVisible", "publicDisplayOrder");
