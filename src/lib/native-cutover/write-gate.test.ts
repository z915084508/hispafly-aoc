import assert from "node:assert/strict";
import { AocDataOrigin } from "@prisma/client";
import { assertNativeOrigin, NativeWriteGateError } from "./write-gate.ts";

for (const origin of [AocDataOrigin.HISPAFLY_NATIVE, AocDataOrigin.IMPORTED, AocDataOrigin.MANUAL]) {
  assert.doesNotThrow(() => assertNativeOrigin("Operational record", origin));
}

for (const origin of [AocDataOrigin.VAMSYS_LEGACY, null, undefined]) {
  assert.throws(() => assertNativeOrigin("Operational record", origin), NativeWriteGateError);
}

console.log("Native write gate provenance rules passed.");
