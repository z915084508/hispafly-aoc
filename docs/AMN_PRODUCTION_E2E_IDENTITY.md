# AMN production certification: allocation identity

The source audit found that `requestAmnPayload` accepted an allocation without checking the returned externalFlightId/operatingDate, and OFP confirmation recomputed operatingDate from selectedDepartureAt. Dated-flight operating dates can differ from UTC departure day; ad hoc allocation IDs can differ from the subsequently created native flight ID.

This change checks the backend allocation identity before signing it, saves its externalFlightId and operatingDate in booking provenance, and confirms with that original pair after OFP creation. It does not change the scheduler, departure editability, payload numbers, or ACARS computation. Legacy bookings without an allocation day retain their prior UTC-date fallback; the original day cannot be reconstructed with certainty.

The AMN request/confirmation HTTP shapes are unchanged. The internal signed allocation provenance gains an `operatingDate` string (YYYY-MM-DD). Existing externalFlightId remains authoritative. Mismatched allocation responses fail with PAYLOAD_IDENTITY_MISMATCH. AMN's matching change returns current lifecycle on retries and rejects expired holds instead of silently renewing them; AOC continues to require an active HELD allocation for new dispatch generation.

Validation: `npm run test:amn` includes response identity rejection, original-day provenance, midnight boundary confirmation, legacy fallback, invalid-day rejection, signed-token/tamper/expiry and departure-editability checks.

Production limit: the audited AOC native ACARS completion persists native PIREPs, but no AMN PIREP sender was found. The AMN audit also found no production PIREP ingestion or per-flight world-feedback writer. These changes fix allocation/confirmation identity; they do not claim that a production flight is already certified. See the matching AMN PR's HISPAFLY_AMN_E2E_AUDIT.md for the full chain and remaining blockers. No ACARS changes are required by these findings.
