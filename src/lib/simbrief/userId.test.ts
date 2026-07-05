import assert from "node:assert/strict";
import { normalizeSimbriefUserId, simbriefUrlWithUserId } from "./userId.ts";

assert.equal(normalizeSimbriefUserId("  Pilot_123-X  "), "Pilot_123-X");
assert.equal(normalizeSimbriefUserId("   "), null);
assert.throws(() => normalizeSimbriefUserId("bad id"), /Invalid/);
assert.throws(() => normalizeSimbriefUserId("x".repeat(65)), /Invalid/);
assert.equal(new URL(simbriefUrlWithUserId("https://www.simbrief.com/system/dispatch.php?orig=LEMD", "Pilot_123")!).searchParams.get("userid"), "Pilot_123");
console.log("SimBrief user ID: 5 assertions passed.");
