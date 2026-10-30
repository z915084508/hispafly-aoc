import { isMain, runCli, schemaPath } from "./cli.mjs";

export function buildProduction({ env = process.env, run = runCli } = {}) {
  const buildEnv = { ...env };
  // Retired flags can never opt a normal build into database writes.
  delete buildEnv.AOC_RUN_MIGRATIONS;
  delete buildEnv.AOC_RUN_STAFF_BOOTSTRAP;
  run("prisma", ["generate", "--schema", schemaPath], { env: buildEnv });
  run("next", ["build"], { env: buildEnv });
}

if (isMain(import.meta.url)) {
  try { buildProduction(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
