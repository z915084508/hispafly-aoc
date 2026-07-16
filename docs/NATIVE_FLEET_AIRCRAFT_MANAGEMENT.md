# Native Fleet & Aircraft Management

## Responsibilities

`Fleet` describes an aircraft family/type and its operational capacity. `Aircraft` describes one registered airframe and references Fleet and current Airport by HispaFly internal IDs. Aircraft-specific weights and fuel performance remain in the existing `AircraftPerformanceProfile`; maintenance conclusions remain in the existing maintenance module.

No TASK 5.3 service calls or writes to vAMSYS.

## Lifecycle

Fleet uses `DRAFT`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`. Only `ACTIVE` Native Fleets may be assigned to new Aircraft or Routes.

Aircraft uses `AVAILABLE`, `RESERVED`, `DISPATCHED`, `IN_FLIGHT`, `TURNAROUND`, `MAINTENANCE`, `FERRY_ONLY`, `AOG`, `SUSPENDED`, `RETIRED`, `UNKNOWN`. Only `AVAILABLE` passes normal assignment. Ferry-only is permitted only when the caller declares an approved maintenance ferry.

## Location

`AircraftLocationSnapshot.aircraftId` is the Native identity. The legacy external field is retained for compatibility; Native snapshots use a non-external `native:<aircraftId>` compatibility marker and never treat it as an operational key. Manual corrections require an active internal Airport or consistent coordinates, a reason, and an audit event.

Location sources include manual, Native Dispatch/ACARS/PIREP, imported and legacy values. ACARS upload is not implemented in this task.

## Availability

`checkAircraftAvailability` returns `allowed`, `blockingReasons`, `warnings`, and `checkedAt`. It checks Aircraft and Fleet status, current Airport, existing maintenance/AOG conclusion, ferry restriction, overlapping Flight/Booking/Dispatch records, and Route/Fleet compatibility. UI consumers must not duplicate these rules.

## Maintenance and utilization

The existing condition snapshot and maintenance order remain authoritative. TASK 5.3 adds optional internal Aircraft relations and safely backfills matches by unique legacy ID. Editing Aircraft identity never resets maintenance history.

Flight minutes and cycles are controlled fields. Authorized corrections require a reason and audit before/after values. Future accepted Native PIREPs will increment them.

## Native and Legacy

Legacy Fleet/Aircraft records remain read-only and retain all source IDs/payloads. Authorized Staff may copy selected fields into a new Native record. New records receive new internal IDs and never inherit a vAMSYS ID. Registration/code conflicts are rejected for manual review.

## Permissions

- Fleet: `FLEET_VIEW`, `FLEET_CREATE`, `FLEET_EDIT`, `FLEET_ARCHIVE`
- Aircraft: `AIRCRAFT_VIEW`, `AIRCRAFT_CREATE`, `AIRCRAFT_EDIT`, `AIRCRAFT_STATUS_MANAGE`, `AIRCRAFT_LOCATION_MANAGE`, `AIRCRAFT_ARCHIVE`

Fleet Manager receives the management set. Viewer receives view-only permissions. Server actions and services use the existing TASK 4 RBAC identity and audit system.

## Migration and rollback

Migration `20260716230000_native_fleet_aircraft_management` is additive. It adds enums, nullable profile fields and internal maintenance relations, then backfills only exact unique legacy-ID matches. It does not delete historical data or require external network access.

Rollback is application-level: deploy the previous application version and retain additive columns/enums. Do not remove PostgreSQL enum values from production.

## Consumers

TASK 5.4 Schedule/Flight generation consumes active Fleet compatibility and internal Aircraft availability. TASK 5.5 Booking and TASK 5.6 Dispatch consume the structured availability service. Future ACARS updates location/status through internal Aircraft ID. Native PIREP will own automatic hours/cycles updates.
