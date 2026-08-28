UPDATE "Pirep"
SET "reviewedByName" = 'HISPAFLY ACARS Policy v2'
WHERE "reviewedByName" = 'HISPAFLY ACARS Automatic Validation';

UPDATE "PirepReview"
SET "reviewerName" = 'HISPAFLY ACARS Policy v2'
WHERE "reviewerName" = 'HISPAFLY ACARS Automatic Validation'
  AND "automatic" = true;
