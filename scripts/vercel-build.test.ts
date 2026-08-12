import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./vercel-build.mjs", import.meta.url)), "utf8");

assert.match(source, /AOC_RUN_MIGRATIONS === "true"/);
assert.doesNotMatch(source, /vercelEnvironment === "production" \|\| process\.env\.AOC_RUN_MIGRATIONS/);
assert.match(source, /Skipping Prisma migrations unless AOC_RUN_MIGRATIONS=true/);
assert.match(source, /AOC_RUN_STAFF_BOOTSTRAP === "true"/);
assert.match(source, /pnpm", \["prisma", "generate"\]/);
assert.match(source, /pnpm", \["exec", "next", "build"\]/);

console.log("Vercel build migration gating contracts passed.");
