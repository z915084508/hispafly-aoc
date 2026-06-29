import assert from "node:assert/strict";
import { mapVamsysPilot } from "./pilotMapper.ts";

const pilot = mapVamsysPilot(
  { data: { id: 42, username: "hsp.maria", first_name: "María", last_name: "Santos", email: "maria@example.test" } },
  { data: { pilot_id: "HSP-42", callsign: "HSF042", vatsim_id: 1234567, rank: { name: "Captain", abbreviation: "CPT" }, hub: { id: "LEMD" } } },
);

assert.equal(pilot.vamsysPilotId, "HSP-42");
assert.equal(pilot.vamsysUserId, "42");
assert.equal(pilot.displayName, "María Santos");
assert.equal(pilot.vatsimId, "1234567");
assert.equal(pilot.rankAbbreviation, "CPT");
assert.equal(pilot.hubId, "LEMD");
assert.throws(() => mapVamsysPilot({ data: {} }, { data: {} }), /pilot identifier/);

console.log("vAMSYS pilot mapper: 7 test cases passed.");
