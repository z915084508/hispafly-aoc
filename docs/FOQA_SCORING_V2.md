# FOQA scoring v2 / operational log

## Contract and storage

- ACARS retains its existing telemetry contract. `events[].textValue` carries PascalCase FOQA evidence; the operational envelope can carry the same payload in `metadata.TextValue`.
- Confirmation and closure are transport records of **one** episode. The AOC maps RuleId, deduplicates both transport channels by event type + episode ID and stores one OperationalEvent per episode. Raw AcarsEvent rows remain as transport evidence.
- `AcarsSession.operationalEventBuffer` retains operational-only batches until completion. It is a transport buffer, not a second flight log.
- Database uniqueness is `(pirepId, eventType, episodeId)`. Legacy rows have null episode IDs and remain intact.
- An unfinished episode at PIREP completion becomes DATA_QUALITY; its unknown final duration/peak is never estimated for penalties.
- Malformed payloads, missing gear normalization/retractability and invalid configuration data are retained without pilot penalties.

## Scoring

Starts at 100. Operational 70%, efficiency 30%; unavailable efficiency is explicitly omitted and the operational weight is renormalized. There are no large landing bonuses or landing-rate efficiency deductions.

| Rule | Episode penalty / disposition |
| --- | --- |
| Taxi overspeed >30 kt for 10 seconds | >30–35: 1; >35–40: 3; >40–50: 6; >50: 10 + review |
| IAS >250 below 10,000 ft for 10 seconds | >250–260: 2; >260–280: 4; >280–300: 8; >300: 12 + review |
| Recovery | IAS ≤245 / taxi GS ≤28 for 3 seconds; INFO, zero |
| Climb gear above 1,500 RA | <15 sec: 1; 15–60 sec or >2,500 RA: 3; >5,000 RA: 6; >60 sec: 6 + review |
| Cruise gear | <60 sec: 8; ≥60 sec: 12 + review |
| Gear speed above supplied VLE | ≤5: 5; >5–15: 10; >15: 20 + review |
| Flap speed above supplied VFE | ≤5: 4; >5–15: 8; >15: 15 + review |
| Taxi-out flaps | INFO after existing 90-second window; 2 only with an explicit reliable runway-approach gate |
| Takeoff flap invalid | 15 + review |
| Taxi-in / on-block flaps | 1 each |
| Beacon / strobe / supported transponder | 2 |
| Landing / taxi / navigation lights | 1; all SOP/light penalties combined capped at 8 |
| Landing quality | Worst G/rate band only: normal 0, firm 2, hard 7, very hard 15, extreme 25 + review |
| Approach | Momentary 1–2; recovered / go-around 2; still unstable below 500 and land 10 + review |
| Reserve shortfall | <10%: 3; 10–25%: 8; >25%: 15 + review |
| High fuel, go-around, pause, seatbelt | 0 |
| Time acceleration, slew/teleport, refueling, impossible position jump | Review; configured integrity invalidation supported |
| Positive evidence | Stable approach 2, warmup/cooldown 1 each, full SOP 2; total max 5; score max 100 |

## Staff disposition and concurrency

PIREP_SCORE permission is checked server-side. Every disposition requires a reason. A transaction locks the PIREP scoring key, changes disposition, recomputes all impacts/caps and final score, and inserts an audit entry. Original payload and original impact are not overwritten. Reconfirmation does not bypass missing-data eligibility. Flight analysis uses the same lock and reads the latest dispositions before writing scores. PIREP acceptance, payroll and rejected-flight eligibility remain separate review decisions. Monetary payroll landing bonuses/penalties are outside this FOQA score change and remain unchanged.

## Migration / rollout

`20260827210000_foqa_scoring_v2` is additive. Deploy AOC schema/API before the updated ACARS client. No historical PIREPs are automatically regraded. Back up production before the normal migration procedure; no production migration has been performed by this task.

CI found a pre-existing clean-database bootstrap failure in `20260716170000_native_schedule_flight_generation` (missing `FlightScheduleStatus`). The v2 migration test therefore constructs the exact pre-v2 schema at commit `8137288`, applies the new SQL and checks zero schema drift. It does not edit or mark historical production migrations as resolved.

## Capability limits

- Reliable runway proximity, transponder, aircraft-specific VFE/detent mapping, stable-approach/warmup/cooldown positive evidence, GPWS/TAWS and fuel/integrity signals are not all exposed by current connectors. The scoring engine supports those confirmed events but does not invent telemetry or enable a detector without its inputs.
- ACARS supports explicit takeoff flap min/max profiles and VFE by validated detent. When no range is supplied it retains missing-extension detection. Current connectors do not yet populate the optional detent/runway-proximity fields; those detections remain inactive until trustworthy inputs are supplied.
- Older connectors without explicit retractability degrade gear scoring to DATA_QUALITY rather than assuming retractability.
- AOC's current completion API supplies a final landing G. For multiple touchdowns, earlier touchdowns use their recorded rates; only the final touchdown receives the completion G.
- Browser visual verification requires an authenticated app instance with this branch and a migrated test database.

## Verification commands

`pnpm test:foqa`, `pnpm test:acars-completion`, `pnpm test:flight-analysis`, `FOQA_TEST_DATABASE=1 node --experimental-strip-types src/lib/pirep/foqa-database.test.ts`, Prisma validation/migration drift check, `pnpm exec tsc --noEmit`, `pnpm exec next build`.

ACARS CI runs the full .NET solution, native normalization tests and Windows build. Neither branch is merged or released automatically by this task.
