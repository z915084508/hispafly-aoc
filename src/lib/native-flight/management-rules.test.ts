import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  periodsOverlap, validateAirportInput, validateDuration, validateEffectivePeriod,
  validateRouteBasics, validateTimezone,
} from "./management-rules.ts";

assert.deepEqual(validateAirportInput({ icao: " levc ", iata: "vlc", timezone: "Europe/Madrid", latitude: 39.49, longitude: -0.48 }), {
  icao: "LEVC", iata: "VLC", timezone: "Europe/Madrid", latitude: 39.49, longitude: -0.48,
});
assert.throws(() => validateAirportInput({ icao: "LEVC", latitude: 91 }), /Latitude/);
assert.throws(() => validateAirportInput({ icao: "LEVC", longitude: -181 }), /Longitude/);
assert.throws(() => validateTimezone("Not/A_Timezone"), /IANA/);
assert.equal(validateDuration(120), 120);
assert.throws(() => validateDuration(0));
assert.throws(() => validateDuration(1441));
assert.throws(() => validateEffectivePeriod(new Date("2026-08-02"), new Date("2026-08-01")), /earlier/);
assert.throws(() => validateRouteBasics({ routeCode: "HSP-1", departureAirportId: "a", arrivalAirportId: "a" }), /differ/);
assert.equal(periodsOverlap(new Date("2026-01-01"), new Date("2026-02-01"), new Date("2026-02-01"), null), true);
assert.equal(periodsOverlap(new Date("2026-01-01"), new Date("2026-01-31"), new Date("2026-02-01"), null), false);

const routeService = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
assert.doesNotMatch(routeService, /@\/lib\/vamsys|fetch\(|axios|VAMSYS_API/);
assert.match(routeService, /departureAirportId/);
assert.match(routeService, /defaultFleetId/);
assert.match(routeService, /LEGACY_ROUTE_COPIED/);

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
assert.match(schema, /enum AirportStatus \{[\s\S]*ARCHIVED/);
assert.match(schema, /enum RouteOperationalStatus \{[\s\S]*SUSPENDED/);

console.log("Native airport and route management rule tests passed.");
