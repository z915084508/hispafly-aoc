import assert from "node:assert/strict";
import test from "node:test";
import { distanceKm, jumpseatCostCents } from "./position-rules.ts";

test("distance uses airport coordinates", () => {
  const madridToBarcelona = distanceKm({ latitude: 40.4722, longitude: -3.56083 }, { latitude: 41.2971, longitude: 2.07846 });
  assert.ok(madridToBarcelona !== null && madridToBarcelona >= 480 && madridToBarcelona <= 490);
});

test("jumpseat pricing has a minimum and scales with distance", () => {
  assert.equal(jumpseatCostCents(10), 1500);
  assert.equal(jumpseatCostCents(500), 6000);
  assert.ok(jumpseatCostCents(1000) > jumpseatCostCents(500));
});

test("distance rejects airports without coordinates", () => {
  assert.equal(distanceKm({ latitude: null, longitude: 1 }, { latitude: 2, longitude: 3 }), null);
});
