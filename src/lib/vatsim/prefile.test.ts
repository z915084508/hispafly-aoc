import assert from "node:assert/strict";
import { buildVatsimPrefile } from "./prefile.ts";

const result = buildVatsimPrefile({
  general: { callsign: "HPF200", route: "NANDO DCT CLS", cruise_tas: "450", initial_altitude: "35000", alternate_icao: "LEVC", dx_rmk: "PBN/B2 DOF/260712" },
  aircraft: { icaocode: "A320", equip: "SDE2E3FGHIRWY", transponder: "LB1", reg: "EC-ABC" },
  origin: { icao_code: "LEMD" }, destination: { icao_code: "LEBL" },
  times: { est_time_enroute: "4500" }, fuel: { plan_ramp: "6000", avg_fuel_flow: "2400" },
}, { departureAt: new Date("2026-07-12T14:30:00Z") });

assert.deepEqual(result.missing, []);
assert.ok(result.url?.startsWith("https://my.vatsim.net/pilots/flightplan?"));
assert.equal(result.fields["2"], "HPF200");
assert.equal(result.fields["6"], "1430");
assert.equal(result.fields["10a"], "01");
assert.equal(result.fields["10b"], "15");
assert.equal(result.fields["12a"], "02");
assert.equal(result.fields["12b"], "30");
assert.match(result.fields["11"], /REG\/ECABC/);

const incomplete = buildVatsimPrefile({}, {});
assert.equal(incomplete.url, null);
assert.ok(incomplete.missing.includes("callsign"));
assert.ok(incomplete.missing.includes("fuel endurance"));

console.log("VATSIM prefile: 10 assertions passed.");
