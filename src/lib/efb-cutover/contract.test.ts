import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const pilot = read("src/app/api/efb/pilot/[...segments]/route.ts");
const signature = read("src/app/api/efb/ofp/[bookingId]/signature/route.ts");
const pilotTrack = read("src/app/api/pilot/live-flights/[sessionId]/track/route.ts");
const tracking = read("src/lib/acars/live-tracking.ts");

assert.match(pilot, /pilotId:\s*pilot\.id/, "EFB pilot data must be scoped to the authenticated pilot");
assert.match(pilot, /dataOrigin:\s*"HISPAFLY_NATIVE"/, "OFP access must use a native dispatch");
assert.match(pilot, /efb_read_forbidden/, "Inactive or non-pilot users must be rejected");
assert.match(pilot, /wallet_balance_cents:\s*profile\.walletBalanceCents/, "Pilot profile must expose the wallet balance");
assert.match(pilot, /current_airport:\s*profile\.currentAirport\?\.icao/, "Pilot profile must expose a readable current location");
assert.match(pilot, /hub:\s*profile\.hubId\s*\|\|\s*profile\.base/, "Pilot profile must expose the pilot hub");
assert.match(pilot, /departure_icao:\s*row\.departure/, "PIREP responses must expose normalized departure ICAO");
assert.match(pilot, /arrival_icao:\s*row\.arrival/, "PIREP responses must expose normalized arrival ICAO");
assert.match(signature, /flightDispatch:\s*\{\s*bookingId,\s*pilotId,\s*dataOrigin:\s*"HISPAFLY_NATIVE"/, "OFP signatures must verify native booking ownership");
assert.match(signature, /body\.contentHash\s*!==\s*ofp\.contentHash/, "OFP signatures must lock the reviewed content hash");
assert.match(signature, /writeAuditLogSafely/, "OFP signing must create an audit record");
assert.match(pilotTrack, /getFlightTrack\([^,]+,\s*user\.pilot\.id\)/, "Pilot tracks must pass the authenticated pilot identity");
assert.match(tracking, /session:\s*\{\s*pilotId\s*\}/, "Track queries must enforce session ownership");
for (const source of [pilot, signature, pilotTrack, tracking]) assert.doesNotMatch(source, /vamsys\.io|oauth\/token/i);

console.log("HISPAFLY AOC EFB ownership and cutover contract passed.");
