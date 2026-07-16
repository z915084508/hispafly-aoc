import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.ts";
const hash=await hashPassword("A-strong-test-password-2026");
assert.match(hash,/^scrypt:v1:/);assert.equal(await verifyPassword("A-strong-test-password-2026",hash),true);assert.equal(await verifyPassword("incorrect-password",hash),false);await assert.rejects(()=>hashPassword("short"));console.log("Identity password tests passed.");
