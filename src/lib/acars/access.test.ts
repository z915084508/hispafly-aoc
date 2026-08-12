import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const access = fs.readFileSync("src/lib/acars/access.ts", "utf8");
const assignment = fs.readFileSync("src/app/api/acars/assignment/route.ts", "utf8");
const session = fs.readFileSync("src/app/api/acars/sessions/route.ts", "utf8");
const telemetry = fs.readFileSync("src/app/api/acars/sessions/[sessionId]/telemetry/route.ts", "utf8");
assert.match(schema, /acarsBetaAccess\s+Boolean\s+@default\(false\)/);
assert.match(access, /pilot\?\.acarsBetaAccess/);
for (const route of [assignment, session, telemetry]) {
  assert.match(route, /hasAcarsTestAccess/);
  assert.match(route, /acars_beta_access_required/);
  assert.match(route, /status:\s*403/);
}
console.log("ACARS Beta access gate: 11 assertions passed.");
