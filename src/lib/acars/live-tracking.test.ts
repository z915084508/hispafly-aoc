import assert from "node:assert/strict";
import { connectionStatus } from "./connection-status.ts";
const now=new Date("2026-07-16T12:00:00Z");
assert.equal(connectionStatus(new Date("2026-07-16T11:59:40Z"),"ACTIVE",now),"ONLINE");
assert.equal(connectionStatus(new Date("2026-07-16T11:59:00Z"),"ACTIVE",now),"DELAYED");
assert.equal(connectionStatus(new Date("2026-07-16T11:57:00Z"),"ACTIVE",now),"OFFLINE");
assert.equal(connectionStatus(new Date("2026-07-16T11:00:00Z"),"COMPLETED",now),"COMPLETED");
console.log("Live tracking status: 4 assertions passed.");
