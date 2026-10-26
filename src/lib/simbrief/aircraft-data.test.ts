import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapAmnAircraftData, kgToThousandPounds, assertOfpAircraftWeights } from "./aircraft-data.ts";
import { simbriefDispatchUrl } from "./dispatch-url.ts";
import { buildSimBriefGeneratePayload } from "./payload.ts";
import { buildSimBriefFormBody } from "./types.ts";
const profile = { operatingEmptyWeightKg: 42000, maxZeroFuelWeightKg: 62500, maxTakeoffWeightKg: 78000, maxLandingWeightKg: 66000, maxFuelKg: 24000 };
const data = mapAmnAircraftData(profile, 180);
assert.equal(kgToThousandPounds(453.59237), 1);
assert.equal(data.mzfw, 137.789);
assert.equal(data.maxpax, 180);
for (const kg of [0, -1, NaN, Infinity]) assert.throws(() => kgToThousandPounds(kg));
assert.throws(() => mapAmnAircraftData(null), /AircraftPerformanceProfile/);
for (const key of Object.keys(profile)) for (const value of [0, -1, NaN, Infinity]) assert.throws(() => mapAmnAircraftData({ ...profile, [key]: value }));
for (const key of ["operatingEmptyWeightKg", "maxZeroFuelWeightKg", "maxTakeoffWeightKg", "maxLandingWeightKg"]) assert.throws(() => mapAmnAircraftData({ ...profile, [key]: null }), /missing or invalid/);
assert.throws(() => mapAmnAircraftData({ ...profile, operatingEmptyWeightKg: 70000 }), /inconsistent/);
assert.equal(mapAmnAircraftData({ ...profile, maxFuelKg: null }).maxfuel, undefined);
const url = new URL(simbriefDispatchUrl({ staticId: "test", aircraftType: "A320", departure: "LEMD", arrival: "LEVC", performanceProfile: profile, seatCapacity: 180 }));
assert.deepEqual(JSON.parse(url.searchParams.get("acdata")!), data);
assert.equal(url.searchParams.get("type"), "A320");
assert.throws(() => simbriefDispatchUrl({ staticId: "test", departure: "LEMD", arrival: "LEVC", performanceProfile: null }), /AircraftPerformanceProfile/);
const payload = buildSimBriefGeneratePayload({ staticId: "test", aircraftData: data, departureIcao: "LEMD", arrivalIcao: "LEVC", aircraftType: "A320", flightNumber: "HF0200", callsign: null, aircraftRegistration: "EC-ABC", selectedDepartureAt: new Date(), passengers: 150, freightKg: 0, cargoKg: null, userRoute: null, altitude: null });
assert.deepEqual(JSON.parse(buildSimBriefFormBody(payload).get("acdata")!), data);
assert.equal(buildSimBriefFormBody(payload).has("mzfw"), false);
const weights = { oew: "42000", max_zfw: "62500", max_tow: "76000", max_tow_struct: "78000", max_ldw: "66000" };
assert.doesNotThrow(() => assertOfpAircraftWeights({ params: { units: "kgs" }, weights }, data));
const lbs = Object.fromEntries(Object.entries(weights).map(([k,v]) => [k, Math.round(Number(v) / 0.45359237)]));
assert.doesNotThrow(() => assertOfpAircraftWeights({ params: { units: "LBS" }, weights: lbs }, data));
for (const key of ["oew", "max_zfw", "max_tow_struct", "max_ldw"]) {
  assert.throws(() => assertOfpAircraftWeights({ params: { units: "kgs" }, weights: { ...weights, [key]: "99999" } }, data), /does not match AMN/);
  assert.throws(() => assertOfpAircraftWeights({ params: { units: "kgs" }, weights: { ...weights, [key]: "" } }, data), /missing or invalid/);
}
assert.throws(() => assertOfpAircraftWeights({ weights }, data), /units/);
assert.throws(() => assertOfpAircraftWeights({ params: { units: "KGS" } }, data), /missing/);
// Wiring regression: both inbound paths validate before storing an OFP/signature state.
const service = readFileSync(new URL("./ofp.ts", import.meta.url), "utf8");
for (const name of ["importSimbriefOfp", "generateDispatchSimBriefOfp"]) {
  const section = service.slice(service.indexOf(`export async function ${name}`));
  assert.ok(section.indexOf("assertOfpAircraftWeights(") >= 0);
  assert.ok(section.indexOf("assertOfpAircraftWeights(") < section.indexOf("prisma.ofpBriefing.update("));
  assert.ok(section.includes("await dispatchAircraftData("));
}
assert.match(service, /include: \{ performanceProfile: true \}/);
console.log("AMN aircraft data: conversion, missing config, manual/API serialization, KGS/LBS response validation and inbound wiring passed.");
