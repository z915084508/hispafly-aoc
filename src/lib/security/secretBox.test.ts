import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./secretBox.ts";

process.env.VAMSYS_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const encrypted = encryptSecret("refresh-token-value");
assert.match(encrypted, /^enc:v1:/);
assert.notEqual(encrypted, "refresh-token-value");
assert.equal(decryptSecret(encrypted), "refresh-token-value");
assert.equal(decryptSecret("legacy-plaintext-token"), "legacy-plaintext-token");

console.log("secretBox tests passed");
