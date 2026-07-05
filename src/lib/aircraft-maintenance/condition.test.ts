import assert from "node:assert/strict";
import { aircraftCategory, calculateAircraftWear, calculateMaintenanceCost, statusForCondition } from "./condition.ts";
assert.equal(aircraftCategory("A320"),"NARROWBODY"); assert.equal(aircraftCategory("A359"),"WIDEBODY"); assert.equal(aircraftCategory("A388"),"SUPER_HEAVY");
assert.equal(statusForCondition(29.99),"FERRY_ONLY"); assert.equal(statusForCondition(19.99),"AOG");
assert.equal(calculateAircraftWear({aircraftType:"A320",blockMinutes:60,landingRate:-250,landingG:1.4,pirepStatus:"accepted"}).wearPercent,.38);
assert.equal(calculateAircraftWear({aircraftType:"A320",blockMinutes:60,landingRate:-650,landingG:2,pirepStatus:"accepted"}).hardLanding,true);
assert.equal(calculateMaintenanceCost({aircraftType:"A320",currentCondition:20,targetCondition:90,maintenanceType:"HEAVY_CHECK"}),10_500_000);
console.log("Aircraft maintenance rules: 8 assertions passed.");
