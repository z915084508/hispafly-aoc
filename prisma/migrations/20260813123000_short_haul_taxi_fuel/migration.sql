-- The original SHORT_HAUL policy seed omitted taxiFuelKg, so generated OFPs
-- persisted a null taxi fuel in their immutable fuel-policy snapshot.
UPDATE "FuelPolicyProfile"
SET "taxiFuelKg" = 200,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'fuel-policy-europe-short-haul'
  AND "taxiFuelKg" IS NULL;
