import assert from "node:assert/strict";
import {
  assertVamsysNetworkDisabled,
  VAMSYS_LEGACY_MODE,
  VamsysDisconnectedError,
} from "./legacy-policy.ts";

assert.equal(VAMSYS_LEGACY_MODE, true);
assert.throws(
  () => assertVamsysNetworkDisabled("test request"),
  (error) =>
    error instanceof VamsysDisconnectedError &&
    error.code === "VAMSYS_LEGACY_DISCONNECTED",
);

console.log("vAMSYS legacy freeze policy tests passed.");
