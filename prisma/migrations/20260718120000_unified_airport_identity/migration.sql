-- Airport.dataOrigin and Airport.source are provenance metadata. They no longer
-- determine whether an airport can participate in HispaFly operations.
--
-- Preserve every Airport primary key and foreign-key relationship. Before adding
-- the case-insensitive guard, fail safely if historical imports contain ICAO
-- duplicates which differ only by case; an operator must reconcile those records
-- deliberately rather than allowing an automatic destructive merge.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Airport"
    GROUP BY UPPER("icao")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Airport ICAO duplicates exist after case normalization; migration aborted without changing data';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Airport_icao_normalized_key"
  ON "Airport" (UPPER("icao"));

COMMENT ON COLUMN "Airport"."dataOrigin" IS
  'Import provenance only; must not control operational eligibility or editability.';
COMMENT ON COLUMN "Airport"."source" IS
  'Free-form import source metadata; must not control operational eligibility or editability.';

