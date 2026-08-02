# Optional outbound and return Programación

When Operations selects **Crear también el vuelo de regreso** while creating a new Programación, the server creates two `FlightSchedule` records as `DRAFT` in one transaction.

- The selected return Route must reverse the outbound airports.
- The return uses the same fleet, aircraft, effective period, booking offsets and generation horizon.
- Return departure is outbound arrival plus the selected turnaround, with a minimum of 45 minutes.
- Operating days shift automatically when the outbound arrival and turnaround cross UTC midnight.
- Neither schedule is published and no `Flight`, `FlightOffer`, Booking, Dispatch or OFP is created.
- If either structural create fails, the transaction rolls back both drafts.
