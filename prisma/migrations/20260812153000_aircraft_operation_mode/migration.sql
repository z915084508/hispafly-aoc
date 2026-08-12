CREATE TYPE "AircraftOperationMode" AS ENUM ('FREE', 'SCHEDULED', 'FLEX');

ALTER TABLE "Aircraft"
ADD COLUMN "operationMode" "AircraftOperationMode" NOT NULL DEFAULT 'FLEX';

CREATE INDEX "Aircraft_operationMode_idx" ON "Aircraft"("operationMode");
