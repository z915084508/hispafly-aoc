import { spawnSync } from "node:child_process";

const vercelEnvironment = process.env.VERCEL_ENV ?? "local";
const shouldRunDatabaseSetup =
  vercelEnvironment === "production" || process.env.AOC_RUN_MIGRATIONS === "true";

function sleep(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function runMigrationWithRetry() {
  const attempts = 4;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      run("pnpm", ["prisma", "migrate", "deploy"]);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      const delaySeconds = attempt * 15;
      console.warn(
        `Prisma migration attempt ${attempt}/${attempts} failed. Retrying in ${delaySeconds} seconds...`,
      );
      sleep(delaySeconds * 1000);
    }
  }
}

console.log(`Vercel environment: ${vercelEnvironment}`);

if (shouldRunDatabaseSetup) {
  console.log("Running production database migration and Staff bootstrap.");
  runMigrationWithRetry();
} else {
  console.log(
    "Skipping database migration and Staff bootstrap for this non-production build to avoid concurrent Prisma advisory locks.",
  );
}

run("pnpm", ["prisma", "generate"]);

if (shouldRunDatabaseSetup) {
  run("npm", ["run", "staff:bootstrap"]);
}

run("pnpm", ["exec", "next", "build"]);
