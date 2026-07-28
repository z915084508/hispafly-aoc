CREATE TABLE "SoftwareRelease" (
  "id" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "downloadUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" BIGINT NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedByStaffId" TEXT,
  CONSTRAINT "SoftwareRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SoftwareRelease_product_version_key" ON "SoftwareRelease"("product", "version");
CREATE INDEX "SoftwareRelease_product_publishedAt_idx" ON "SoftwareRelease"("product", "publishedAt" DESC);
