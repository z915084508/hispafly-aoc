import assert from "node:assert/strict";
import { formToVamsysPayload, externalRouteToPrisma } from "./mapper.ts";
import { validateRouteForm } from "./validation.ts";

const form = new FormData();
for (const [key,value] of Object.entries({ type:"scheduled",callsign:"HPF123",flightNumber:"HF123",departureIcao:"levc",arrivalIcao:"lemd",durationMinutes:"65",distanceNm:"180",altitude:"32000",costIndex:"25",route:"DCT",internalNotes:"local only" })) form.set(key,value);
form.append("fleetIds","local-fleet");
const input = validateRouteForm(form);
assert.equal(input.departureIcao,"LEVC"); assert.equal(input.arrivalIcao,"LEMD");
const payload = formToVamsysPayload(input,100,200,[10],true);
assert.deepEqual(payload.fleet_ids,[10]); assert.equal(payload.flight_length,"01:05:00"); assert.equal("internalNotes" in payload,false); assert.equal("internal_remarks" in payload,false);
const mapped = externalRouteToPrisma({id:1,type:"scheduled",departure_id:100,arrival_id:200,callsign:"HPF123",flight_number:"HF123",hidden:false,fleet_ids:[10]},new Map([["100","LEVC"],["200","LEMD"]]));
assert.equal(mapped.vamsysRouteId,"1"); assert.equal(mapped.operationalStatus,"ACTIVE"); assert.equal(mapped.syncStatus,"SYNCED");
const invalid = new FormData();
for (const [key,value] of form.entries()) invalid.append(key,value);
invalid.set("arrivalIcao","LEVC"); assert.throws(()=>validateRouteForm(invalid),/different/);
console.log("vAMSYS routes: mapper and validation tests passed.");
