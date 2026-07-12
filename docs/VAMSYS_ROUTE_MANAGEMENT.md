# vAMSYS route management

## Contract status

The supplied 21-page PDF omitted the Routes section. The live official OpenAPI documentation was subsequently inspected on 2026-07-12 and confirms the contract below.

## Confirmed route contract

- `GET /routes`: cursor pagination with `page[size]`, `page[cursor]`, `sort` and route filters.
- `POST /routes`: creates a route and returns 201 `RouteData`; validation failures return 422.
- `GET /routes/{route_id}`: returns one route.
- `PUT /routes/{route_id}`: supports partial updates and returns 200 `RouteData`; departure and arrival cannot be changed.
- `DELETE /routes/{route_id}`: permanently deletes a route and returns 204. Existing bookings and PIREPs are retained but orphaned, so the AOC does not expose this operation in its normal UI.

Create requires `type`, `callsign`, `flight_number`, `departure_id` and `arrival_id`. Supported optional fields used by the AOC are `departure_time`, `arrival_time`, `flight_length`, `flight_distance`, `altitude`, `cost_index`, `route`, `hidden`, `remarks` and `fleet_ids`. The API also supports `start_date`, `end_date`, `internal_remarks`, `service_days`, `tag`, `container_ids`, `loadfactor_ids`, `simbrief_options` and `callsign_options`. HISPAFLY `internalNotes` is local-only and is never mapped to `internal_remarks`.

The existing read integration currently uses `GET /api/v3/operations/routes` and `GET /api/v3/operations/routes/{id}`. These paths are established by the existing application, but this task has not independently confirmed them from an official OpenAPI document.

Before enabling publication, obtain the current official Operations OpenAPI document from vAMSYS and record the exact collection/detail endpoints, create/update schemas, concurrency mechanism, fleet assignment structure, pagination, errors, and supported disable/hide/archive operation. Add adapter tests using captured schema-compliant fixtures. Never test writes against an ordinary production route.

## OAuth and environment

- `VAMSYS_OPERATIONS_CLIENT_ID` and `VAMSYS_OPERATIONS_CLIENT_SECRET` remain server-only.
- `VAMSYS_OPERATIONS_SCOPES` defaults to `*` for compatibility.
- Recommended restricted value after vAMSYS grants it: `ops:read ops:config:write ops:flights:write`.
- Restart the server to clear the in-memory access-token cache after changing scopes.

No token or credential is stored in the database. The client records returned scopes only in its in-memory token cache. Local scope inspection is informational; vAMSYS remains the authorization authority.

## Safe activation

1. Obtain the official Operations OpenAPI contract from vAMSYS.
2. Implement and test the route adapter against mocked responses.
3. Confirm the Operations client is granted `ops:config:write`.
4. Set the restricted scope value in Vercel and redeploy to clear the old cache.
5. If a real test is authorized, require `VAMSYS_OPERATIONS_INTEGRATION_TEST=true`, `VAMSYS_OPERATIONS_TEST_ROUTE_PREFIX=TEST-`, and `VAMSYS_OPERATIONS_ALLOW_WRITES=true` and create only an unmistakable TEST route.

## Known limitations

Create, update, disable, hide, archive, and delete are unsupported until the official contract is available. No production write was attempted.
