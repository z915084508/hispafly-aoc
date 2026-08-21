import assert from "node:assert/strict";
import { automaticPilotRank, careerProgress, effectivePilotRank, legacyAppointment, normalizePilotRank } from "./career.ts";

assert.equal(normalizePilotRank("Captain"), "CPT");
assert.equal(normalizePilotRank(null, "Senior First Officer"), "SFO");
assert.equal(normalizePilotRank(), "TRN");
assert.equal(automaticPilotRank({ acceptedSectors: 159, acceptedMinutes: 6_001, totalPireps: 159 }), "SFO");
assert.equal(effectivePilotRank({ acceptedSectors: 159, acceptedMinutes: 6_001, totalPireps: 159 }, "Staff Team"), "SFO");
assert.equal(effectivePilotRank({ acceptedSectors: 159, acceptedMinutes: 6_001, totalPireps: 159 }, "CPT"), "CPT");
assert.equal(legacyAppointment("Staff Team"), "Staff Team");
assert.deepEqual(careerProgress("TRN", { acceptedSectors: 5, acceptedMinutes: 300, totalPireps: 5 }), expectProgress(100, true));
assert.equal(careerProgress("SFO", { acceptedSectors: 150, acceptedMinutes: 18_000, totalPireps: 160 }).eligible, false);
assert.equal(careerProgress("SFO", { acceptedSectors: 152, acceptedMinutes: 18_000, totalPireps: 160 }).eligible, true);

function expectProgress(percent: number, eligible: boolean) {
  return { next: "FO", approval: false, requirements: [{ label: "Accepted sectors", current: 5, target: 5, unit: "sectors" }], percent, eligible };
}

console.log("pilot career tests passed");
