import assert from "node:assert/strict";
import { amnConfirmationIdentity } from "./confirmation-identity.ts";
const departure = new Date("2026-09-05T00:30:00Z");
assert.deepEqual(amnConfirmationIdentity({ externalFlightId: "aoc-flight", operatingDate: "2026-09-04" }, "HF1234", departure), { externalFlightId: "aoc-flight", operatingDate: "2026-09-04" });
assert.deepEqual(amnConfirmationIdentity({ externalFlightId: "adhoc:route:time" }, "HF1234", departure), { externalFlightId: "adhoc:route:time", operatingDate: "2026-09-05" });
assert.throws(() => amnConfirmationIdentity({ externalFlightId: "aoc-flight", operatingDate: "2026-02-30" }, null, departure));
console.log("AMN confirmation identity: preserved operating day and legacy compatibility passed.");
