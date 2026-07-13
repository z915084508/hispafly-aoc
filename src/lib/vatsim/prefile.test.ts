import assert from "node:assert/strict";
import { buildVatsimPrefile } from "./prefile.ts";

const completeSnapshot = {
  general: { callsign: "HPF200", route: "NANDO DCT CLS", cruise_tas: "450", initial_altitude: "35000", alternate_icao: "LEVC", dx_rmk: "PBN/B2 DOF/260712" },
  aircraft: { icaocode: "A320", equip: "SDE2E3FGHIRWY", transponder: "LB1", reg: "EC-ABC" },
  origin: { icao_code: "LEMD" },
  destination: { icao_code: "LEBL" },
  fuel: { plan_ramp: "6000", avg_fuel_flow: "2400" },
};

const result = buildVatsimPrefile({
  ...completeSnapshot,
  times: { est_time_enroute: "4500" },
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
assert.match(result.icaoText, /^\(FPL-HPF200-I/m);
assert.match(result.icaoText, /-LEMD1430/);

const hhmmss = buildVatsimPrefile({
  ...completeSnapshot,
  times: { est_time_enroute: "01:25:00", endurance: "02:17:00" },
}, { departureAt: new Date("2026-07-12T14:30:00Z") });
assert.equal(hhmmss.fields["10a"], "01");
assert.equal(hhmmss.fields["10b"], "25");
assert.equal(hhmmss.fields["12a"], "02");
assert.equal(hhmmss.fields["12b"], "17");
assert.ok(!hhmmss.missing.includes("estimated en-route time"));

const objectDuration = buildVatsimPrefile({
  ...completeSnapshot,
  times: { est_time_enroute: { hours: 1, minutes: 5 }, endurance: { total_minutes: 140 } },
}, { departureAt: new Date("2026-07-12T14:30:00Z") });
assert.equal(objectDuration.fields["10a"], "01");
assert.equal(objectDuration.fields["10b"], "05");
assert.equal(objectDuration.fields["12a"], "02");
assert.equal(objectDuration.fields["12b"], "20");

const fallbackDuration = buildVatsimPrefile(completeSnapshot, {
  departureAt: new Date("2026-07-12T14:30:00Z"),
  estimatedDurationMinutes: 95,
});
assert.equal(fallbackDuration.fields["10a"], "01");
assert.equal(fallbackDuration.fields["10b"], "35");
assert.ok(!fallbackDuration.missing.includes("estimated en-route time"));
assert.ok(fallbackDuration.url?.startsWith("https://my.vatsim.net/pilots/flightplan?"));

const arrivalFallback = buildVatsimPrefile(completeSnapshot, {
  departureAt: new Date("2026-07-12T14:30:00Z"),
  estimatedArrivalAt: new Date("2026-07-12T16:00:00Z"),
});
assert.equal(arrivalFallback.fields["10a"], "01");
assert.equal(arrivalFallback.fields["10b"], "30");

const incomplete = buildVatsimPrefile({}, {});
assert.equal(incomplete.url, null);
assert.ok(incomplete.missing.includes("callsign"));
assert.ok(incomplete.missing.includes("fuel endurance"));
assert.match(incomplete.icaoText, /CALLSIGN/);

console.log("VATSIM prefile tests passed.");
