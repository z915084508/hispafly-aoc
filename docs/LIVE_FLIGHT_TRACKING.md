# TASK 6.4 — Live Flight Tracking

Staff with Dispatch visibility can monitor Native ACARS sessions at `/staff/live-flights`.

- The operations list refreshes every 10 seconds.
- Heartbeats are `ONLINE` through 30 seconds, `DELAYED` through 120 seconds, then `OFFLINE`.
- The map shows the latest normalized ACARS position.
- Selecting a flight loads its stored track without changing Dispatch or PIREP state.
- Completed sessions remain visible for 24 hours.

API:

- `GET /api/staff/live-flights`
- `GET /api/staff/live-flights/{sessionId}/track`

TASK 6.4 is monitoring-only. PIREP generation, scoring, payroll and rewards remain outside this scope.
