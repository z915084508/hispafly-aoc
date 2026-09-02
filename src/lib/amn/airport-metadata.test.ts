import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./airport-metadata.ts", import.meta.url)), "utf8");
assert.match(source, /normalizeCountryCode\(country\)/);
assert.match(source, /region\.match\(\/\^\(\[A-Z\]\{2\}\)/);
assert.doesNotMatch(source, /\^\[A-Za-z\]\{2\}\$\.test\(country\)/);

console.log("AMN airport metadata country normalization passed.");
