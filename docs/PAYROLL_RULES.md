# Virtual Payroll Rules

## Principles

Payroll is virtual and derived only from accepted PIREPs. Calculations must be deterministic, reproducible and tied to a versioned rule set. Stored money values use integer cents.

## Initial mock formula

For design and UI demonstration only:

`eligible pay = accepted block hours × configured hourly rate + approved bonuses`

Block minutes are converted to hours at calculation time and the final line is rounded to the nearest cent. Rejected, pending, duplicated or deleted source PIREPs are not eligible.

## Lifecycle

- **Draft:** calculated and may be safely recalculated with the same rule version.
- **Review:** an exception requires staff attention.
- **Approved:** reviewed and locked for period closing.
- **Posted:** represented by an immutable wallet transaction.

## Adjustments and reversals

Staff must not edit posted transactions. Corrections create a new adjustment or reversal that references the original record, includes a reason and captures the responsible staff identity.

## Future decisions

Rates by rank or aircraft, route and event bonuses, minimum block time, training rules, inactivity policy, period closing authority, retroactive PIREP changes and currency display all require business approval before production implementation.
