import assert from "node:assert/strict";
import { buildIdentityEmail } from "./delivery.ts";

const verify = buildIdentityEmail({ type: "verify_email", token: "a token/+", baseUrl: "https://aoc.hispafly.es/" });
assert.equal(verify.url, "https://aoc.hispafly.es/verify-email?token=a%20token%2F%2B");
assert.match(verify.subject, /Verify/);
assert.match(verify.html, /VERIFY EMAIL/);

const reset = buildIdentityEmail({ type: "reset_password", token: "reset-token", baseUrl: "https://aoc.hispafly.es" });
assert.equal(reset.url, "https://aoc.hispafly.es/reset-password?token=reset-token");
assert.match(reset.text, /30 minutes/);
console.log("Identity email tests passed.");
