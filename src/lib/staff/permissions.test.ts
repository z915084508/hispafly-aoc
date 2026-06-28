import assert from "node:assert/strict";
import { hasStaffPermission } from "./permissions.ts";

assert.equal(hasStaffPermission("ADMIN", "PAYROLL_APPROVE"), true);
assert.equal(hasStaffPermission("ADMIN", "PAYROLL_MARK_PAID"), true);
assert.equal(hasStaffPermission("OPS", "PAYROLL_APPROVE"), true);
assert.equal(hasStaffPermission("OPS", "PAYROLL_MARK_PAID"), false);
assert.equal(hasStaffPermission("FINANCE", "PAYROLL_MARK_PAID"), true);
assert.equal(hasStaffPermission("FINANCE", "PAYROLL_REJECT"), false);
assert.equal(hasStaffPermission("VIEWER", "PAYROLL_RECALCULATE"), false);
assert.equal(hasStaffPermission("ADMIN", "VAMSYS_PIREP_SYNC"), true);
assert.equal(hasStaffPermission("OPS", "VAMSYS_PIREP_SYNC"), true);
assert.equal(hasStaffPermission("FINANCE", "VAMSYS_PIREP_SYNC"), false);
assert.equal(hasStaffPermission("VIEWER", "VAMSYS_PIREP_SYNC"), false);
assert.equal(hasStaffPermission("ADMIN", "VAMSYS_OPERATIONS_SYNC"), true);
assert.equal(hasStaffPermission("OPS", "VAMSYS_OPERATIONS_SYNC"), true);
assert.equal(hasStaffPermission("FINANCE", "VAMSYS_OPERATIONS_SYNC"), false);
assert.equal(hasStaffPermission("VIEWER", "VAMSYS_OPERATIONS_SYNC"), false);

console.log("Staff permissions: 15 test cases passed.");
