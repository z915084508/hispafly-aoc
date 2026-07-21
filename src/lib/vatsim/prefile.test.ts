import assert from "node:assert/strict";
import { buildVatsimPrefile, vatsimPrefileUnlocked } from "./prefile.ts";

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
const resultUrl = new URL(result.url!);
assert.equal(resultUrl.searchParams.get("raw"), result.icaoText);
assert.equal(resultUrl.searchParams.get("fuel_time"), "0230");
assert.equal(resultUrl.searchParams.has("2"), false);
assert.equal(result.fields["2"], "HPF200");
assert.equal(result.fields["6"], "1430");
assert.equal(result.fields["10a"], "01");
assert.equal(result.fields["10b"], "15");
assert.equal(result.fields["12a"], "02");
assert.equal(result.fields["12b"], "30");
assert.match(result.fields["11"], /REG\/ECABC/);
assert.match(result.icaoText, /^\(FPL-HPF200-I/m);
assert.match(result.icaoText, /-LEMD1430/);
assert.equal(result.fields["3"], "A320/SDE2E3FGHIRWY/LB1");

const splitEquipment = buildVatsimPrefile({
  ...completeSnapshot,
  aircraft: { icao_code: "A321", equip: "SDE2E3FGHIRWY", transponder: "LB1", reg: "EC-GRR" },
  times: { est_time_enroute: "00:35", endurance: "01:58" },
}, {});
assert.equal(splitEquipment.fields["3"], "A321/SDE2E3FGHIRWY/LB1");
assert.ok(!splitEquipment.missing.includes("aircraft type and equipment"));

const officialVatsimUrl = "https://my.vatsim.net/pilots/flightplan?raw=%28FPL-HPF200-IS%0A-A320%2FM-SDE2E3FGHIRWY%2FLB1%0A-LEMD1430%0A-N0450F350+NANDO+DCT+CLS%0A-LEBL0115+LEVC%0A-E%2F0230+OPR%2FHISPAFLY%29&fuel_time=0230";
const officialPrefile = buildVatsimPrefile({
  ...completeSnapshot,
  prefile: { vatsim: { link: officialVatsimUrl } },
  times: { est_time_enroute: "01:15", endurance: "02:30" },
}, { departureAt: new Date("2026-07-12T14:30:00Z") });
assert.equal(officialPrefile.url, new URL(officialVatsimUrl).toString());

const untrustedPrefile = buildVatsimPrefile({
  ...completeSnapshot,
  prefile: { vatsim: { link: "https://example.com/pilots/flightplan?raw=(FPL-BAD)" } },
  times: { est_time_enroute: "01:15", endurance: "02:30" },
}, { departureAt: new Date("2026-07-12T14:30:00Z") });
assert.equal(new URL(untrustedPrefile.url!).hostname, "my.vatsim.net");
assert.equal(new URL(untrustedPrefile.url!).searchParams.get("raw"), untrustedPrefile.icaoText);

const alternateArray = buildVatsimPrefile({
  ...completeSnapshot,
  general: { ...completeSnapshot.general, alternate_icao: "" },
  alternate: [{ airport: { icao_code: "LEAL" } }],
  times: { est_time_enroute: "00:35", endurance: "01:58" },
}, {});
assert.equal(alternateArray.fields["13"], "LEAL");

const typeOnly = buildVatsimPrefile({ ...completeSnapshot, aircraft: { icao_code: "A321" }, times: { est_time_enroute: "00:35", endurance: "01:58" } }, {});
assert.ok(typeOnly.missing.includes("aircraft type and equipment"));

assert.equal(vatsimPrefileUnlocked("HISPAFLY_NATIVE", "CHECK_REQUIRED", "SIGNED"), true);
assert.equal(vatsimPrefileUnlocked("HISPAFLY_NATIVE", "RELEASED"), true);
assert.equal(vatsimPrefileUnlocked("HISPAFLY_NATIVE", "DISPATCHED"), false);
assert.equal(vatsimPrefileUnlocked("VAMSYS_LEGACY", "DISPATCHED"), true);

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
