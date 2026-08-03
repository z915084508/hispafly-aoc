import assert from "node:assert/strict";
import { generateTemporaryPassword, hashStaffPassword, verifyStaffPassword } from "./password.ts";

const temporaryPassword = generateTemporaryPassword();
assert.match(temporaryPassword, /^Hf1![A-Za-z0-9_-]+$/);
assert.equal(temporaryPassword.length >= 12, true);

const hash = await hashStaffPassword(temporaryPassword);
assert.equal(await verifyStaffPassword(temporaryPassword, hash), true);
assert.equal(await verifyStaffPassword(`${temporaryPassword}x`, hash), false);

console.log("Staff password authentication: 4 assertions passed.");
