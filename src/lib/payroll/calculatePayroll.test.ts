import assert from "node:assert/strict";
import { calculatePayroll, isPayrollEligible } from "./calculatePayroll.ts";

const a320 = calculatePayroll({ aircraftType: "A320", flightTimeMinutes: 120, network: "VATSIM", landingRate: -180, score: 90 });
assert.equal(a320.basePay, 160);
assert.equal(a320.networkBonus, 16);
assert.equal(a320.landingBonus, 100);
assert.equal(a320.finalAmount, 276);

const a388 = calculatePayroll({ aircraftType: "A388", flightTimeMinutes: 600, network: "OFFLINE", landingRate: -400, score: 96 });
assert.equal(a388.basePay, 1500);
assert.equal(a388.scoreBonus, 150);
assert.equal(a388.finalAmount, 1650);

const hardLanding = calculatePayroll({ aircraftType: "A320", flightTimeMinutes: 60, network: "OFFLINE", landingRate: -601, score: 90 });
assert.equal(hardLanding.landingPenalty, 200);
assert.equal(hardLanding.finalAmount, 0);

const lowScore = calculatePayroll({ aircraftType: "A321", flightTimeMinutes: 120, network: "OFFLINE", landingRate: -400, score: 69 });
assert.equal(lowScore.scorePenalty, 150);
assert.equal(lowScore.finalAmount, 20);

const crjx = calculatePayroll({ aircraftType: "CRJX", flightTimeMinutes: 60, network: "OFFLINE", landingRate: -300, score: 80 });
assert.equal(crjx.hourlyRate, 80);

const at76 = calculatePayroll({ aircraftType: "AT76", flightTimeMinutes: 60, network: "OFFLINE", landingRate: -300, score: 80 });
assert.equal(at76.hourlyRate, 80);

assert.equal(isPayrollEligible({ status: "accepted" }), true);
assert.equal(isPayrollEligible({ status: "rejected" }), false);

console.log("Payroll engine: 7 test cases passed.");
