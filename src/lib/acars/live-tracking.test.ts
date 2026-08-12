import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectionStatus } from "./connection-status.ts";
import { readFileSync as readSource } from "node:fs";

const now = new Date("2026-07-16T12:00:00Z");
assert.equal(connectionStatus(new Date("2026-07-16T11:59:40Z"), "ACTIVE", now), "ONLINE");
assert.equal(connectionStatus(new Date("2026-07-16T11:59:00Z"), "ACTIVE", now), "DELAYED");
assert.equal(connectionStatus(new Date("2026-07-16T11:57:00Z"), "ACTIVE", now), "OFFLINE");
assert.equal(connectionStatus(new Date("2026-07-16T11:00:00Z"), "COMPLETED", now), "COMPLETED");
const liveTrackingSource = readSource(fileURLToPath(new URL("./live-tracking.ts", import.meta.url)), "utf8");
assert.match(liveTrackingSource, /status:\s*"ACTIVE"/);
assert.match(liveTrackingSource, /lastHeartbeatAt:\s*\{\s*gte:\s*liveSince\s*\}/);
assert.doesNotMatch(liveTrackingSource, /"ACTIVE",\s*"COMPLETED"/);

const assignmentRoute = readFileSync(
  fileURLToPath(new URL("../../app/api/acars/assignment/route.ts", import.meta.url)),
  "utf8",
);
assert.match(assignmentRoute, /passengers:\s*assignment\.passengers\s*\?\?\s*0/);
assert.match(assignmentRoute, /cargoKg:\s*assignment\.cargoKg\s*\?\?\s*0/);
assert.match(assignmentRoute, /assignment_unavailable/);

console.log("Live tracking and ACARS assignment contract: 10 assertions passed.");
