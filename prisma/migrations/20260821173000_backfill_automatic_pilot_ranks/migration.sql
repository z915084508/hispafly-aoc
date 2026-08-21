WITH pilot_stats AS (
  SELECT
    p."id" AS "pilotId",
    COUNT(r."id") FILTER (WHERE r."status" = 'accepted')::integer AS "acceptedSectors",
    COALESCE(SUM(COALESCE(r."flightTimeMinutes", r."blockTimeMinutes", 0)) FILTER (WHERE r."status" = 'accepted'), 0)::integer AS "acceptedMinutes"
  FROM "Pilot" p
  LEFT JOIN "Pirep" r ON r."pilotId" = p."id"
  GROUP BY p."id"
), ranked AS (
  SELECT
    p."id",
    CASE
      WHEN UPPER(COALESCE(p."rankAbbreviation", p."rankName", p."rank", '')) IN ('CPT', 'CAPTAIN') THEN 'CPT'
      WHEN UPPER(COALESCE(p."rankAbbreviation", p."rankName", p."rank", '')) IN ('SCPT', 'SENIOR CAPTAIN') THEN 'SCPT'
      WHEN s."acceptedMinutes" >= 6000 AND s."acceptedSectors" >= 50 THEN 'SFO'
      WHEN s."acceptedSectors" >= 5 THEN 'FO'
      ELSE 'TRN'
    END AS "newRank",
    CASE
      WHEN UPPER(COALESCE(p."rankAbbreviation", p."rankName", p."rank", '')) NOT IN
        ('TRN', 'TRAINEE', 'TRAINEE PILOT', 'FO', 'FIRST OFFICER', 'SFO', 'SENIOR FIRST OFFICER', 'CPT', 'CAPTAIN', 'SCPT', 'SENIOR CAPTAIN')
      THEN COALESCE(p."rankName", p."rank", p."rankAbbreviation")
      ELSE NULL
    END AS "legacyAppointment"
  FROM "Pilot" p
  JOIN pilot_stats s ON s."pilotId" = p."id"
)
UPDATE "Pilot" p
SET
  "appointment" = COALESCE(p."appointment", ranked."legacyAppointment"),
  "rank" = ranked."newRank",
  "rankAbbreviation" = ranked."newRank",
  "rankName" = CASE ranked."newRank"
    WHEN 'TRN' THEN 'Trainee Pilot'
    WHEN 'FO' THEN 'First Officer'
    WHEN 'SFO' THEN 'Senior First Officer'
    WHEN 'CPT' THEN 'Captain'
    WHEN 'SCPT' THEN 'Senior Captain'
  END,
  "updatedAt" = NOW()
FROM ranked
WHERE p."id" = ranked."id";
