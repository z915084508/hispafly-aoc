-- Manual emergency rollback for this migration. Prisma does not execute this
-- file automatically. Dropping the additional normalized index does not modify
-- Airport rows, primary keys, or historical foreign-key relationships.
DROP INDEX IF EXISTS "Airport_icao_normalized_key";
COMMENT ON COLUMN "Airport"."dataOrigin" IS NULL;
COMMENT ON COLUMN "Airport"."source" IS NULL;

