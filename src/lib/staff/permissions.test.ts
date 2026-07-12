import assert from "node:assert/strict";
import { hasStaffPermission } from "./permissions.ts";

assert.equal(hasStaffPermission("ADMIN", "PAYROLL_APPROVE"), true);
assert.equal(hasStaffPermission("ADMIN", "PAYROLL_MARK_PAID"), true);
assert.equal(hasStaffPermission("OPS", "PAYROLL_APPROVE"), true);
assert.equal(hasStaffPermission("OPS", "PAYROLL_MARK_PAID"), false);
assert.equal(hasStaffPermission("FINANCE", "PAYROLL_MARK_PAID"), true);
assert.equal(hasStaffPermission("FINANCE", "PAYROLL_REJECT"), false);
assert.equal(hasStaffPermission("VIEWER", "PAYROLL_RECALCULATE"), false);
assert.equal(hasStaffPermission("ADMIN", "FLEET_DELETE"), true);
assert.equal(hasStaffPermission("OPS", "FLEET_EDIT"), true);
assert.equal(hasStaffPermission("OPS", "FLEET_DELETE"), false);
assert.equal(hasStaffPermission("VIEWER", "FLEET_VIEW"), true);
assert.equal(hasStaffPermission("FINANCE", "FLEET_CREATE"), false);

console.log("Staff permissions: 12 test cases passed.");
