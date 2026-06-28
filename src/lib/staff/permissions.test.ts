import assert from "node:assert/strict";
import { hasStaffPermission } from "./permissions.ts";

assert.equal(hasStaffPermission("ADMIN", "PAYROLL_APPROVE"), true);
assert.equal(hasStaffPermission("ADMIN", "PAYROLL_MARK_PAID"), true);
assert.equal(hasStaffPermission("OPS", "PAYROLL_APPROVE"), true);
assert.equal(hasStaffPermission("OPS", "PAYROLL_MARK_PAID"), false);
assert.equal(hasStaffPermission("FINANCE", "PAYROLL_MARK_PAID"), true);
assert.equal(hasStaffPermission("FINANCE", "PAYROLL_REJECT"), false);
assert.equal(hasStaffPermission("VIEWER", "PAYROLL_RECALCULATE"), false);

console.log("Staff permissions: 7 test cases passed.");
