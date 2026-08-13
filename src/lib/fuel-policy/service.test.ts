import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveTaxiFuelKg } from "./rules.ts";

assert.equal(resolveTaxiFuelKg(250, 180), 250, "policy taxi fuel must take precedence");
assert.equal(resolveTaxiFuelKg(null, 180), 180, "aircraft performance taxi fuel must be the fallback");
assert.equal(resolveTaxiFuelKg(null, null), null, "an actually unconfigured taxi fuel remains absent");
assert.equal(resolveTaxiFuelKg(0, 180), 0, "an explicit zero must not be treated as missing");

const migration = readFileSync(fileURLToPath(new URL("../../../prisma/migrations/20260813123000_short_haul_taxi_fuel/migration.sql", import.meta.url)), "utf8");
assert.match(migration, /fuel-policy-europe-short-haul/);
assert.match(migration, /"taxiFuelKg"\s*=\s*200/);
assert.match(migration, /"taxiFuelKg"\s+IS\s+NULL/i, "the backfill must preserve an operator-configured value");

console.log("Fuel policy service tests passed.");
