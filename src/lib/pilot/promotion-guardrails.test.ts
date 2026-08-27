import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pirepActions = readFileSync(new URL("../../app/staff/pireps/[id]/actions.ts", import.meta.url), "utf8");
const pilotActions = readFileSync(new URL("../../app/staff/pilots/[id]/actions.ts", import.meta.url), "utf8");
const pilotPage = readFileSync(new URL("../../app/staff/pilots/[id]/page.tsx", import.meta.url), "utf8");

assert.match(pirepActions, /accept PIREP", "PIREP_ACCEPT"/);
assert.match(pirepActions, /reject PIREP", "PIREP_REJECT"/);
assert.match(pirepActions, /send PIREP to manual review"\)/);
assert.doesNotMatch(pilotActions, /rankName\s*:/);
assert.doesNotMatch(pilotActions, /appointment\s*:/);
assert.doesNotMatch(pilotPage, /name="rankName"/);
assert.match(pilotPage, /Rank changes require the dedicated promotion workflow/);

console.log("Promotion governance guardrails passed.");
