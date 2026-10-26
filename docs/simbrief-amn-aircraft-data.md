# SimBrief AMN aircraft weight synchronization

The aircraft's local AircraftPerformanceProfile is the only source for OEW, MZFW, MTOW and MLW. Missing, non-positive, non-finite or inconsistent required limits stop generation. Optional maximum fuel and seat capacity are sent when configured. No aircraft or profile configuration is changed by this fix.

## Request contract

Official reference (checked 2026-10-26): https://developers.navigraph.com/docs/simbrief/using-the-api

SimBrief documents aircraft overrides inside JSON `acdata`: `oew`, `mzfw`, `mtow`, `mlw`, `maxfuel`, `maxpax`. Weight values use thousands of pounds with up to three decimals, independently of OFP display units. Conversion: kg / 453.59237, rounded to three decimals. Top-level `mzfw` etc. are not used.

- Manual dispatch URL: the shared mapper creates JSON encoded by URLSearchParams; an explicit aircraft type accompanies the data. Pending existing manual links are refreshed when the briefing is reopened through creation; completed documents are preserved.
- API generation: the same mapped object is placed in `acdata`; the existing form serializer emits JSON in the POST form to `/v2/plan/generate`. Fuel policy does not override it.
- Manual import and API response: validate `params.units` (KGS/LBS), `weights.oew`, `max_zfw`, `max_tow_struct` (fallback `max_tow`), and `max_ldw_struct` (fallback `max_ldw`) before saving AWAITING_SIGNATURE. A 2 kg tolerance accounts for request and response rounding. Unknown units, missing fields and mismatches fail explicitly. Structural limits avoid false mismatches from performance-limited takeoff weights when supplied. A response exposing only reduced performance limits fails closed and needs review.

The public official documentation confirms the acdata contract but does not provide a publicly discoverable specification for this repository's authenticated v2 generation endpoint. Form serialization and response validation are covered offline; authenticated v2 acceptance remains a staging verification item. No live generation request was made, and no production systems, database, environment variables or AMN configuration were modified.

## Verification

Run `npm run test:simbrief-aircraft-data`, `npm run test:simbrief-ofp-v2`, `npm run test:simbrief-client`, and `npm run test:simbrief-pdf`. The new suite covers conversions, invalid/missing profiles, optional values, manual/API acdata serialization, KGS/LBS responses, mismatched/missing limits and inbound validation ordering. Service wiring checks are source contract regressions, not a live database/API integration test.
