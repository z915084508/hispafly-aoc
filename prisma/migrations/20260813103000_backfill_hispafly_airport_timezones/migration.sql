-- Preserve airport-managed IANA zones and only repair missing values for known
-- HispaFly airports. Unknown airports continue to use the explicit UTC warning.
UPDATE "Airport"
SET "timezone" = 'Europe/Madrid'
WHERE upper("icao") IN ('LEMD', 'LEVC', 'LEPA', 'LEBL')
  AND ("timezone" IS NULL OR btrim("timezone") = '');
