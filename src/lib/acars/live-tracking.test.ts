import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectionStatus } from "./connection-status.ts";

const now = new Date("2026-07-16T12:00:00Z");
assert.equal(connectionStatus(new Date("2026-07-16T11:59:40Z"), "ACTIVE", now), "ONLINE");
assert.equal(connectionStatus(new Date("2026-07-16T11:59:00Z"), "ACTIVE", now), "DELAYED");
assert.equal(connectionStatus(new Date("2026-07-16T11:57:00Z"), "ACTIVE", now), "OFFLINE");
assert.equal(connectionStatus(new Date("2026-07-16T11:00:00Z"), "COMPLETED", now), "COMPLETED");

const assignmentRoute = readFileSync(
  fileURLToPath(new URL("../../app/api/acars/assignment/route.ts", import.meta.url)),
  "utf8",
);
assert.match(assignmentRoute, /passengers:\s*assignment\.passengers\s*\?\?\s*0/);
assert.match(assignmentRoute, /cargoKg:\s*assignment\.cargoKg\s*\?\?\s*0/);
assert.match(assignmentRoute, /assignment_unavailable/);

console.log("Live tracking and ACARS assignment contract: 7 assertions passed.");
