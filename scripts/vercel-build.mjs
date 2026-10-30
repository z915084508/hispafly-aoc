// Compatibility path for old callers. No platform integration or database writes.
import { buildProduction } from "./build.mjs";
try { buildProduction(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
