import { createInterface } from "node:readline/promises";
import { isMain, runCli, schemaPath } from "./cli.mjs";

export async function migrateDatabase({
  args = process.argv.slice(2), env = process.env,
  input = process.stdin, output = process.stdout, ask, run = runCli,
} = {}) {
  if (env.CI || env.GITHUB_ACTIONS) throw new Error("Application migrations are disabled in CI.");
  if (args.length !== 1 || args[0] !== "--confirm") throw new Error("Manual authorization required: npm run db:migrate -- --confirm");
  if (!input.isTTY || !output.isTTY) throw new Error("Migration requires an interactive human terminal; piped/automatic confirmation is refused.");
  // The datasource uses DATABASE_URL, not DIRECT_URL. Do not let a hidden .env
  // silently select the target: require DATABASE_URL explicitly in this shell.
  let target;
  try {
    const url = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
    target = `${url.hostname}:${url.port || "5432"}/${url.pathname.slice(1)}?schema=${encodeURIComponent(url.searchParams.get("schema") || "public")}`;
  } catch { throw new Error("Set an explicit valid PostgreSQL DATABASE_URL in this terminal before requesting migration."); }
  const phrase = `MIGRATE ${target}`;
  let terminal;
  try {
    terminal = ask ? null : createInterface({ input, output });
    const answer = await (ask || ((question) => terminal.question(question)))(
      `Only proceed after explicit migration approval and recovery review.\nTarget: ${target}\nType exactly: ${phrase}\n> `,
    );
    if (answer !== phrase) throw new Error("Migration cancelled: target confirmation did not match.");
  } finally { terminal?.close(); }
  // One operation only: no automatic retries, build or staff bootstrap.
  run("prisma", ["migrate", "deploy", "--schema", schemaPath], { env: { ...env } });
}

if (isMain(import.meta.url)) {
  try { await migrateDatabase(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
