import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProduction } from "./build.mjs";
import { migrateDatabase } from "./migrate.mjs";
import { projectRoot, schemaPath } from "./cli.mjs";

test("ordinary builds ignore retired database-write flags, even when inherited as true", () => {
  for (const flags of [{}, { AOC_RUN_MIGRATIONS: "true", AOC_RUN_STAFF_BOOTSTRAP: "true" }]) {
    const env = { DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test", ...flags };
    const calls = [];
    buildProduction({ env, run: (...args) => calls.push(args) });
    assert.deepEqual(calls.map(([tool, args]) => [tool, args]), [
      ["prisma", ["generate", "--schema", schemaPath]], ["next", ["build"]],
    ]);
    for (const [, , options] of calls) {
      assert.equal(options.env.AOC_RUN_MIGRATIONS, undefined);
      assert.equal(options.env.AOC_RUN_STAFF_BOOTSTRAP, undefined);
    }
    assert.deepEqual(env, { DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test", ...flags });
  }
});

test("client generation failure stops the build without a fallback database operation", () => {
  const calls = [];
  assert.throws(() => buildProduction({ run: (tool, args) => { calls.push([tool, args]); throw new Error("generation failed"); } }), /generation failed/);
  assert.equal(calls.length, 1);
});

const approvedTarget = "test.example.invalid:5432/aoc_test?schema=public";
function migrationFixture(overrides = {}) {
  const calls = [], prompts = [];
  return { calls, prompts, options: {
    args: ["--confirm"], env: { DATABASE_URL: "postgresql://private-user:private-password@test.example.invalid:5432/aoc_test" },
    input: { isTTY: true }, output: { isTTY: true },
    ask: async (question) => { prompts.push(question); return `MIGRATE ${approvedTarget}`; },
    run: (...args) => calls.push(args), ...overrides,
  } };
}

test("migration refuses missing confirmation, CI, non-interactive terminals and invalid targets before invoking Prisma", async (t) => {
  const cases = [
    { args: [] }, { args: ["--confirm", "--force"] },
    { env: { CI: "true" } }, { env: { GITHUB_ACTIONS: "true" } },
    { input: { isTTY: false } }, { output: { isTTY: false } },
    { env: {} }, { env: { DATABASE_URL: "not a URL" } },
    { env: { DATABASE_URL: "https://test.example.invalid/aoc_test" } },
    { env: { DATABASE_URL: "postgresql://test.example.invalid/" } },
    { ask: async () => "yes" },
    { ask: async () => "MIGRATE another.example.invalid:5432/other?schema=public" },
  ];
  for (const [index, invalid] of cases.entries()) await t.test(`refusal ${index + 1}`, async () => {
    const fixture = migrationFixture(invalid);
    await assert.rejects(migrateDatabase(fixture.options));
    assert.equal(fixture.calls.length, 0);
  });
});

test("explicit target confirmation permits only one migration operation (mocked; no database access)", async () => {
  const fixture = migrationFixture();
  await migrateDatabase(fixture.options);
  assert.deepEqual(fixture.calls.map(([tool, args]) => [tool, args]), [["prisma", ["migrate", "deploy", "--schema", schemaPath]]]);
  assert.equal(fixture.prompts.length, 1);
  assert.match(fixture.prompts[0], /test\.example\.invalid:5432\/aoc_test/);
  assert(!fixture.prompts[0].includes("private-user"));
  assert(!fixture.prompts[0].includes("private-password"));
});

test("confirmation follows DATABASE_URL used by this schema, not a different DIRECT_URL", async () => {
  const fixture = migrationFixture();
  fixture.options.env.DIRECT_URL = "postgresql://other-user:secret@other.example.invalid/other";
  await migrateDatabase(fixture.options);
  assert.match(fixture.prompts[0], /test\.example\.invalid/);
  assert(!fixture.prompts[0].includes("other.example.invalid"));
});

test("the real command cannot accept piped confirmation, and prints no connection credentials", () => {
  const result = spawnSync(process.execPath, ["scripts/migrate.mjs", "--confirm"], {
    cwd: projectRoot, encoding: "utf8", input: `MIGRATE ${approvedTarget}\n`,
    env: { ...process.env, CI: "", GITHUB_ACTIONS: "", DATABASE_URL: "postgresql://private-user:private-password@test.example.invalid/aoc_test" },
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive human terminal/);
  assert(!result.stderr.includes("private-password"));
});

test("all managed migration aliases use the guard; build/start have no database lifecycle hooks", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["db:migrate", "db:deploy", "prisma:migrate:deploy"]) assert.equal(pkg.scripts[name], "node scripts/migrate.mjs");
  assert.equal(pkg.scripts.build, "node scripts/build.mjs");
  assert.equal(pkg.scripts.start, "next start");
  for (const hook of ["prebuild", "postbuild", "prestart", "poststart", "preinstall", "install", "postinstall"]) assert.equal(pkg.scripts[hook], undefined);
});
