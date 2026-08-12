import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./authenticate.ts", import.meta.url), "utf8");

assert.match(source, /staffUser\.findMany\(/);
assert.match(source, /for \(const staff of candidates\)/);
assert.match(source, /identifierCandidateCount/);
assert.doesNotMatch(source, /staffUser\.findFirst\(/);

console.log("Staff duplicate identity login: 4 assertions passed.");
