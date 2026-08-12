ALTER TABLE "SoftwareRelease"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'STABLE';

ALTER TABLE "SoftwareRelease"
ADD CONSTRAINT "SoftwareRelease_channel_check" CHECK ("channel" IN ('STABLE', 'BETA'));

CREATE INDEX "SoftwareRelease_product_channel_publishedAt_idx"
ON "SoftwareRelease"("product", "channel", "publishedAt" DESC);
