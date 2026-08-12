import assert from "node:assert/strict";
import { effectiveAcarsReleaseChannel } from "./release-channel.ts";

assert.equal(effectiveAcarsReleaseChannel("STABLE", "1.3.3"), "STABLE");
assert.equal(effectiveAcarsReleaseChannel("BETA", "1.4.0"), "BETA");
assert.equal(effectiveAcarsReleaseChannel(null, "1.4.0-beta.1"), "BETA");
assert.equal(effectiveAcarsReleaseChannel(null, "1.4.0-rc.2"), "BETA");
assert.equal(effectiveAcarsReleaseChannel(null, "1.3.3"), "STABLE");

console.log("ACARS release channel policy: 5 assertions passed.");
