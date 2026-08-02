import assert from "node:assert/strict";
import test from "node:test";
import { airportLocalDay, deriveDepartureAvailability } from "./departures.ts";

test("airport local days honor Madrid summer, winter, and DST lengths", () => {
  const summer = airportLocalDay("2026-08-03", "Europe/Madrid");
  assert.equal(summer.startUtc.toISOString(), "2026-08-02T22:00:00.000Z");
  const winter = airportLocalDay("2026-01-03", "Europe/Madrid");
  assert.equal(winter.startUtc.toISOString(), "2026-01-02T23:00:00.000Z");
  const transition = airportLocalDay("2026-10-25", "Europe/Madrid");
  assert.equal((transition.endUtc.getTime() - transition.startUtc.getTime()) / 3_600_000, 25);
});

test("local midnight, another timezone, and invalid timezone fallback are explicit", () => {
  const madrid = airportLocalDay("2026-08-03", "Europe/Madrid");
  assert.ok(new Date("2026-08-02T22:30:00Z") >= madrid.startUtc);
  assert.equal(airportLocalDay("2026-08-03", "America/New_York").startUtc.toISOString(), "2026-08-03T04:00:00.000Z");
  const fallback = airportLocalDay("2026-08-03", "Not/AZone");
  assert.equal(fallback.timeZone, "UTC"); assert.equal(fallback.fallback, true);
});

const base = { status: "OPEN_FOR_BOOKING", bookingOpenAt: null, bookingCloseAt: null, scheduledDeparture: new Date("2026-08-03T12:00:00Z"), pilotId: "p1", currentAirportId: "a1", departureAirportId: "a1", activeBookings: [], now: new Date("2026-08-03T10:00:00Z") };
test("departure presentation covers available, windows, terminal, and ownership states", () => {
  assert.equal(deriveDepartureAvailability(base).state, "AVAILABLE");
  assert.equal(deriveDepartureAvailability({ ...base, bookingOpenAt: new Date("2026-08-03T11:00:00Z") }).state, "UPCOMING");
  assert.equal(deriveDepartureAvailability({ ...base, bookingCloseAt: new Date("2026-08-03T09:00:00Z") }).state, "CLOSED");
  assert.equal(deriveDepartureAvailability({ ...base, status: "CANCELLED" }).state, "CANCELLED");
  assert.equal(deriveDepartureAvailability({ ...base, status: "COMPLETED" }).state, "FINISHED");
  assert.deepEqual(deriveDepartureAvailability({ ...base, activeBookings: [{ id: "b1", pilotId: "p1" }] }), { state: "MY_BOOKING", bookingId: "b1" });
  assert.equal(deriveDepartureAvailability({ ...base, activeBookings: [{ id: "b2", pilotId: "p2" }] }).state, "RESERVED");
  assert.equal(deriveDepartureAvailability({ ...base, currentAirportId: "a2" }).state, "WRONG_AIRPORT");
});
