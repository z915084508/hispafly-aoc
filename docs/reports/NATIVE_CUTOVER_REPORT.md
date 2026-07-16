# Native Cutover Report

Generated for TASK 5.7 on 2026-07-16.

## Current conclusion

Implementation status: `REVIEW_REQUIRED`.

The Native operational chain and versioned ACARS contract are implemented. EFB Official mode has been cut over from vAMSYS Booking identity to current Native Released Dispatch. Runtime network boundaries are fail-closed. Final production readiness remains data-dependent: the Staff dashboard must be refreshed after migration and every high-risk unresolved/invalid record must be reviewed.

## Production inventory snapshot

Read-only query on 2026-07-16:

| Entity | Total | Native ready | Legacy linked | Unresolved | Historical only | Invalid | Missing relations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Airport | 207 | 6 | 201 | 0 | 0 | 0 | 0 |
| Route | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| Fleet | 15 | 0 | 15 | 0 | 0 | 0 | 0 |
| Aircraft | 34 | 0 | 34 | 0 | 0 | 0 | 0 |
| Schedule | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Flight | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| FlightOffer | 39 | 0 | 0 | 39 | 0 | 0 | 39 |
| Booking | 7 | 0 | 0 | 7 | 0 | 0 | 7 |
| Dispatch | 42 | 0 | 0 | 13 | 0 | 29 | 42 |
| AircraftLocation | 31 | 0 | 31 | 0 | 0 | 0 | 0 |
| PIREP | 1,641 | 0 | 0 | 0 | 1,641 | 0 | 0 |

These counts prove the platform is not yet `READY_FOR_ACARS`: production has no Native Schedule, generated Flight, Booking or Released Dispatch chain. Existing FlightOffers, Bookings and Dispatches require review or historical-only classification. The runtime dashboard recalculates the authoritative values from the current database.

## Confirmed findings

- vAMSYS cron configuration is empty in `vercel.json`.
- vAMSYS cron routes return disabled responses.
- the vAMSYS webhook ignores payload processing and records an audit event.
- Pilot API, Operations API and OAuth token refresh fail before network access.
- Native Booking and Dispatch enforce internal parent identity.
- Native Dispatch no longer fabricates vAMSYS Route/Aircraft IDs in FlightOffer.
- ACARS Assignment is `1.0` and only exposes current Native Released Dispatch.
- EFB active-flight and Official performance resolve Native Flight and Aircraft.
- historical financial, PIREP, OFP, wallet, payroll, maintenance and audit data are not deleted.

## Open production review

- Apply the TASK 5.7 migration.
- Refresh the review queue against production.
- Resolve or mark historical-only every high-risk Booking, Dispatch, Aircraft and PIREP issue.
- Take and record a current database backup.
- validate one complete Native operational flight in the deployed environment.
- revoke and remove obsolete `VAMSYS_*` secrets after backup.

## Decision

Do not manually declare `READY_FOR_ACARS`. The dashboard derives readiness from current inventory and unresolved review records. TASK 6 runtime work may start only after the production checklist is evidenced.
