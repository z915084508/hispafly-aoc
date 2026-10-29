import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import nodemailer from "nodemailer";
import ts from "typescript";

test("patched Nodemailer composes identity mail without SMTP or external resources", async () => {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const result = await transport.sendMail({
    from: "HISPAFLY <identity@example.test>",
    to: "Pilot <pilot@example.test>",
    subject: "Verify your Hispafly account",
    text: "https://aoc.example.test/verify-email?token=local-test",
    html: '<a href="https://aoc.example.test/verify-email?token=local-test">VERIFY EMAIL</a>',
  });
  assert.deepEqual(result.envelope.to, ["pilot@example.test"]);
  const raw = result.message.toString("utf8");
  assert.match(raw, /multipart\/alternative/);
  assert.match(raw, /Verify your Hispafly account/);
  assert.match(raw.replace(/=\r?\n/g, ""), /VERIFY EMAIL/);
  transport.close();
});

test("Prisma 6 loads a nested config with the scoped deepmerge 8 override", async () => {
  const prismaRequire = createRequire(import.meta.resolve("prisma/package.json"));
  const { loadConfigFromFile } = prismaRequire("@prisma/config");
  const directory = await mkdtemp(path.join(tmpdir(), "aoc-prisma-security-"));
  try {
    const configFile = path.join(directory, "prisma.config.mjs");
    await writeFile(configFile, 'export default { schema: "./schema.prisma", migrations: { path: "./migrations" } };\n');
    const result = await loadConfigFromFile({ configFile, configRoot: directory });
    assert.equal(result.error, undefined);
    assert.equal(result.config.schema, path.join(directory, "schema.prisma"));
    assert.equal(result.config.migrations.path, path.join(directory, "migrations"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("identity login keeps password, lockout and session behavior with in-memory persistence", async () => {
  const compile = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString("base64")}`;
  const passwords = await import(compile(await readFile(new URL("../src/lib/auth/password.ts", import.meta.url), "utf8")));
  const user = { id: "security-test-user", email: "pilot@example.test", status: "ACTIVE", failedLoginAttempts: 0,
    lockedUntil: null, passwordHash: await passwords.hashPassword("Local-security-test-123!") };
  const lookups = [], updates = [], sessions = [], audits = [];
  globalThis.__aocSecurityAuthDependencies = {
    prisma: { authUser: {
      findUnique: async (query) => { lookups.push(query); return { ...user }; },
      update: async (query) => { updates.push(query); return { ...user, ...query.data }; },
    } },
    writeAuditLogSafely: async (entry) => { audits.push(entry); },
    createAuthSession: async (...args) => { sessions.push(args); },
    ...passwords,
  };
  try {
    let source = await readFile(new URL("../src/lib/auth/service.ts", import.meta.url), "utf8");
    source = source.replace('import { prisma } from "@/lib/prisma";', 'const { prisma } = globalThis.__aocSecurityAuthDependencies;')
      .replace('import { writeAuditLogSafely } from "@/lib/audit/log";', 'const { writeAuditLogSafely } = globalThis.__aocSecurityAuthDependencies;')
      .replace('import { createAuthSession } from "./session";', 'const { createAuthSession } = globalThis.__aocSecurityAuthDependencies;')
      .replace('import { hashPassword, verifyPassword } from "./password";', 'const { hashPassword, verifyPassword } = globalThis.__aocSecurityAuthDependencies;');
    const { loginWithPassword } = await import(compile(source));
    assert.equal((await loginWithPassword(" PILOT@EXAMPLE.TEST ", "Local-security-test-123!")).id, user.id);
    assert.equal(lookups[0].where.email, user.email);
    assert.equal(sessions.length, 1);
    assert.equal(updates[0].data.failedLoginAttempts, 0);
    user.failedLoginAttempts = 4;
    assert.equal(await loginWithPassword(user.email, "invalid-password"), null);
    assert.equal(updates.at(-1).data.status, "LOCKED");
    assert.equal(updates.at(-1).data.failedLoginAttempts, 5);
    user.lockedUntil = new Date(Date.now() + 60_000);
    const before = updates.length;
    assert.equal(await loginWithPassword(user.email, "Local-security-test-123!"), null);
    assert.equal(updates.length, before);
    assert.equal(sessions.length, 1);
    assert.equal(audits.at(-1).action, "IDENTITY_LOGIN_FAILED");
  } finally {
    delete globalThis.__aocSecurityAuthDependencies;
  }
});
