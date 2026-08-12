import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./booking.ts", import.meta.url)), "utf8");
const action = readFileSync(fileURLToPath(new URL("../../app/pilot/flight-offers/actions.ts", import.meta.url)), "utf8");
const detail = readFileSync(fileURLToPath(new URL("../../app/pilot/flight-offers/[id]/page.tsx", import.meta.url)), "utf8");
const board = readFileSync(fileURLToPath(new URL("../../app/pilot/flight-offers/page.tsx", import.meta.url)), "utf8");
const selfDispatchPage = readFileSync(fileURLToPath(new URL("../../app/pilot/flight-offers/self-dispatch/page.tsx", import.meta.url)), "utf8");
const selfDispatchForm = readFileSync(fileURLToPath(new URL("../../components/native-self-dispatch-form.tsx", import.meta.url)), "utf8");

for (const contract of [
  "claimScheduledFlight", "Serializable", "scheduled-flight-book:", "scheduleId", "operatingType", "ACTIVE_BOOKING_STATUSES",
  "currentAirportId !== flight.departureAirportId", "flight.assignedAircraftId ?? input.aircraftId", "fixed aircraft assignment",
  "nativeFleetId !== flight.fleetId", "currentAirportId !== flight.departureAirportId", "flightDispatch.findFirst",
  "SCHEDULED_FLIGHT_BOOKED", "NativeFlightStatus.BOOKED", "SCHEDULED_FLIGHT_BOOKING_CANCELLED",
  "NativeFlightStatus.OPEN_FOR_BOOKING", "NativeFlightStatus.SCHEDULED", "NativeFlightStatus.EXPIRED",
]) assert.ok(source.includes(contract), `Missing scheduled booking contract: ${contract}`);
assert.ok(action.includes("createNativeBooking") && action.includes("/pilot/bookings/"));
assert.ok(detail.includes("La reserva no crea Dispatch ni OFP") && detail.includes("required"));
assert.ok(board.includes("CREATE MY FLIGHT") && board.includes("/pilot/flight-offers/self-dispatch") && board.includes("loadPilotDepartures"));
assert.ok(selfDispatchForm.includes("routes.filter((item) => item.departure === departure).map((item) => item.arrival)"), "Destination choices must be route-driven, not hidden by current aircraft availability.");
assert.ok(selfDispatchPage.includes('operationMode: { in: ["FREE", "FLEX"] }'), "Self-dispatch must exclude SCHEDULED aircraft.");
assert.ok(!source.includes("flightOffer.create") && !source.includes("ofpBriefing.create") && !source.includes("acarsSession.create"));
console.log("Scheduled Flight atomic booking contracts passed (24 focused assertions).");
