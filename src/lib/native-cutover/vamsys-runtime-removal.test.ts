import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const pilotClient = read("src/lib/vamsys/client.ts");
const operationsClient = read("src/lib/vamsys/operations.ts");
assert.match(pilotClient, /assertVamsysNetworkDisabled\("Pilot API request"\)/);
assert.match(operationsClient, /assertVamsysNetworkDisabled\(`Operations API request/);
assert.match(operationsClient, /isOperationsConfigured = \(\) => false/);

for (const path of [
  "src/lib/efb-performance/http.ts",
  "src/app/pilot/ofp/actions.ts",
  "src/app/staff/settings/operations/actions.ts",
  "src/app/pireps/actions.ts",
  "src/app/staff/pireps/[id]/actions.ts",
]) {
  assert.doesNotMatch(read(path), /@\/lib\/vamsys\/(?:client|token|operations|operationsPireps|fleetSync)/, `${path} must not reach the retired runtime`);
}

const selfDispatch = read("src/app/pilot/flight-offers/self-dispatch/page.tsx");
const routeService = read("src/lib/native-flight/route.ts");
const fleetService = read("src/lib/native-flight/fleet.ts");
const aircraftService = read("src/lib/native-flight/aircraft.ts");
assert.doesNotMatch(selfDispatch, /dataOrigin:\s*\{\s*not:\s*"VAMSYS_LEGACY"/);
assert.doesNotMatch(routeService, /fleet\.dataOrigin\s*===\s*"VAMSYS_LEGACY"/);
assert.doesNotMatch(fleetService, /origin\s*!==\s*"VAMSYS_LEGACY"/);
assert.doesNotMatch(aircraftService, /origin\s*!==\s*"VAMSYS_LEGACY"/);

console.log("vAMSYS runtime removal boundaries passed.");
