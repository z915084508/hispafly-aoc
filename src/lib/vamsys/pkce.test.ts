import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateCodeChallenge, generateCodeVerifier, generateState, secureStateEquals } from "./pkce.ts";

const verifier = generateCodeVerifier();
assert.ok(verifier.length >= 43 && verifier.length <= 128);
assert.match(verifier, /^[A-Za-z0-9_-]+$/);
assert.equal(generateCodeChallenge(verifier), createHash("sha256").update(verifier).digest("base64url"));

const state = generateState();
assert.match(state, /^[A-Za-z0-9_-]+$/);
assert.equal(secureStateEquals(state, state), true);
assert.equal(secureStateEquals(state, generateState()), false);

console.log("vAMSYS PKCE: 6 test cases passed.");
