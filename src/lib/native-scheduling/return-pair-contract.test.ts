import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const form = read("../../components/programacion/schedule-form.tsx");
const actions = read("../../app/staff/operations/programacion/actions.ts");
const management = read("./management.ts");

assert.match(form, /Crear también el vuelo de regreso/);
assert.match(form, /returnRouteId/);
assert.match(form, /returnTurnaroundMinutes/);
assert.match(form, /Guardar ida y regreso/);
assert.match(form, /returnCreationEnabled/);
assert.match(actions, /createFlightScheduleDraftPair/);
assert.match(actions, /createReturn/);
assert.match(management, /RETURN_ROUTE_NOT_REVERSE/);
assert.match(management, /pairedScheduleId/);
assert.match(management, /prisma\.\$transaction/);
assert.doesNotMatch(management + actions, /flightOffer\.create|pilotBooking\.create|flightDispatch\.create|ofpBriefing\.create/i);

console.log("Optional outbound and return Programacion contracts passed.");
