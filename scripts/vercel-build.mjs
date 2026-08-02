import { spawnSync } from "node:child_process";

const vercelEnvironment = process.env.VERCEL_ENV ?? "local";
const shouldRunMigrations = process.env.AOC_RUN_MIGRATIONS === "true";
const shouldRunStaffBootstrap = process.env.AOC_RUN_STAFF_BOOTSTRAP === "true";

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

if (shouldRunMigrations) {
  console.log("AOC_RUN_MIGRATIONS=true: running Prisma production migrations.");
  runMigrationWithRetry();
} else {
  console.log(
    "Skipping Prisma migrations unless AOC_RUN_MIGRATIONS=true. Normal deployments must not compete for Prisma advisory locks.",
  );
}

run("pnpm", ["prisma", "generate"]);

if (shouldRunStaffBootstrap) {
  console.log("AOC_RUN_STAFF_BOOTSTRAP=true: running Staff access bootstrap.");
  run("npm", ["run", "staff:bootstrap"]);
} else {
  console.log("Skipping Staff bootstrap unless AOC_RUN_STAFF_BOOTSTRAP=true.");
}

run("pnpm", ["exec", "next", "build"]);
