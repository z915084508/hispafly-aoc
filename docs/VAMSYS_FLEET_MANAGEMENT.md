# vAMSYS Fleet Management

Official Operations API contract verified on 2026-07-13:

- `GET /fleet` — cursor-paginated fleet list.
- `POST /fleet` — creates a fleet and returns 201.
- `GET /fleet/{fleet_id}` — retrieves a fleet.
- `PUT /fleet/{fleet_id}` — supports partial updates and returns 200.
- `DELETE /fleet/{fleet_id}` — permanent, irreversible deletion returning 204.

Create requires `name`, four-character ICAO `code`, and `type`. Supported types are `pax`, `cargo`, `pax-cargo`, `pax-containers`, and `cargo-containers`. The AOC manages `max_pax`, `max_cargo`, `container_units`, `hide_in_phoenix`, `scoring_group_id`, `simbrief_aircraft_profiles`, `parameter_ids`, `image_attribution`, and `image_linkback`. SimBrief override JSON and binary image upload remain synchronized/read-only until a dedicated validated editor is added.

Permanent deletion is blocked locally while the fleet has route assignments or synchronized aircraft. Aircraft write management is outside this module.
