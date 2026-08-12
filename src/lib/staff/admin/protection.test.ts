import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertRecoveryAccess } from "./protection.ts";

assert.doesNotThrow(() => assertRecoveryAccess(0, true));
assert.doesNotThrow(() => assertRecoveryAccess(1, false));
assert.throws(() => assertRecoveryAccess(0, false), /final Staff permissions administrator/);

const [layoutSource, activeGuardSource] = await Promise.all([
  readFile(new URL("../../../app/staff/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../requireActive.ts", import.meta.url), "utf8"),
]);

assert.match(layoutSource, /requireActiveStaff/);
assert.doesNotMatch(layoutSource, /requireAdminStaff/);
assert.match(activeGuardSource, /getCurrentStaff\(\)/);
assert.match(activeGuardSource, /staff_access_denied/);
assert.doesNotMatch(activeGuardSource, /role\s*[!=]==?\s*["']ADMIN["']/);
assert.doesNotMatch(activeGuardSource, /mustChangePassword/);

console.log("Staff recovery and portal protection: 9 assertions passed.");
