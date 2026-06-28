# Virtual Payroll Rules — Version 1

Virtual payroll is calculated only for PIREPs whose vAMSYS status is `accepted`. A unique database constraint on `PayrollRecord.pirepId` guarantees one payroll record per PIREP.

## Aircraft hourly rates

| Aircraft | Credits/hour |
| --- | ---: |
| A320 | 80 |
| A321 | 85 |
| B772 | 120 |
| A359 | 130 |
| A388 | 150 |

`base pay = flightTimeMinutes / 60 × aircraft hourly rate`

## Bonuses

- VATSIM or IVAO: 10% of base pay.
- Landing rate between -50 and -300 fpm, inclusive: 100 credits.
- Score of 95 or above: 150 credits.

## Penalties

- Landing rate worse than -600 fpm: 200 credits.
- Score below 70: 150 credits.

`final amount = max(0, base pay + bonuses - penalties)`

All persisted amounts use integer cents. Calculation details and the rule version are stored with each payroll record for reproducibility.

## Status workflow

- `pending`: calculated and awaiting staff review.
- `approved`: reviewed and ready for settlement.
- `rejected`: excluded by staff review.
- `paid`: settled once through an immutable wallet transaction.

Approving, rejecting and paying create `AocAuditLog` records. Paying is transactional and can only claim an approved record once, preventing duplicate wallet credits.