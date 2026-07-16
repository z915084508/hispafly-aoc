# Native Airport & Route Management

## Responsibility

`Airport` is HispaFly's internal location identity. ICAO is normalized and unique, while every relationship uses the internal `Airport.id`. `Route` is the reusable network definition consumed by future schedule generation. It references departure and arrival airports and an optional default fleet by internal IDs.

No component in this module calls, synchronizes with, or writes to vAMSYS.

## Lifecycle

Airports use `ACTIVE`, `INACTIVE`, and `ARCHIVED`. Inactive or archived airports cannot be assigned to new or edited routes. Archiving is a soft operation; routes, flights, aircraft locations, raw payloads and legacy references are retained.

Routes use:

- `DRAFT`: editable, not available to schedule generation.
- `ACTIVE`: eligible for TASK 5.4 schedule generation.
- `SUSPENDED`: temporarily unavailable for new schedules.
- `ARCHIVED`: permanently read-only and retained for audit.

Older `INACTIVE` and `HIDDEN` enum values remain for non-destructive compatibility with historical data.

## Native and Legacy policy

New records default to `HISPAFLY_NATIVE`. `IMPORTED` and `MANUAL` records may be managed locally. `VAMSYS_LEGACY` Airport and Route records are read-only. A mapped Legacy Route may be explicitly copied to a new Native `DRAFT`; the copy receives a new internal ID and does not inherit `vamsysRouteId`. The source remains unchanged.

## Validation and conflicts

- ICAO and optional IATA are uppercase and format validated.
- Coordinates and IANA timezone are validated.
- Departure and arrival must differ and reference active internal airports.
- The default fleet must be active, local, and referenced by internal ID.
- Duration is limited to 1–1440 minutes.
- Effective-until cannot precede effective-from.
- Overlapping route code, flight number, and airport-pair candidates are blocked with an explicit warning.
- Authorized Staff may confirm a justified override. The warning and reason are audited; no existing record is overwritten.

## Permissions

| Capability | Permission |
| --- | --- |
| View airports | `AIRPORT_VIEW` |
| Create airports | `AIRPORT_CREATE` |
| Edit/status airports | `AIRPORT_EDIT` |
| Archive airports | `AIRPORT_ARCHIVE` |
| View routes | `ROUTE_VIEW` |
| Create/copy routes | `ROUTE_CREATE` |
| Edit/status routes | `ROUTE_EDIT` |
| Archive routes | `ROUTE_ARCHIVE` |

`NETWORK_PLANNING`, `ADMIN`, and `OWNER` receive the management permissions. `VIEWER` receives view permissions only. Every page and server action verifies permission through the existing TASK 4 RBAC layer.

## Migration and rollback

Migration `20260716210000_native_airport_route_management` only adds enum values and nullable columns. It does not delete or rewrite data and requires no network access.

Rollback is application-level: redeploy the previous application version while leaving the additive database values/columns in place. PostgreSQL enum values should not be removed from a production database.

## TASK 5.4 contract

TASK 5.4 may consume only `ACTIVE` routes whose internal departure and arrival airports are `ACTIVE`, whose effective period includes the schedule date, and whose optional default fleet remains active. It must not use Legacy IDs as operational keys.

## Known limitations

- TASK 5.2 does not generate schedules or dated flights.
- Legacy routes without internal Airport mappings cannot be copied automatically.
- No external publication, ACARS, booking, PIREP, or live tracking is implemented.
- Fleet and Aircraft management remain TASK 5.3.
