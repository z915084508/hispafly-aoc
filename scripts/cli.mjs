import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");

export function isMain(url) {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === url;
}

export function runCli(tool, args, { env = process.env } = {}) {
  const entries = { prisma: "build/index.js", next: "dist/bin/next" };
  if (!Object.hasOwn(entries, tool)) throw new Error("Unsupported application CLI.");
  const executable = path.join(path.dirname(require.resolve(`${tool}/package.json`)), entries[tool]);
  const result = spawnSync(process.execPath, [executable, ...args], { cwd: projectRoot, env, stdio: "inherit", shell: false });
  // Never print CLI arguments/environment: connection URLs may contain credentials.
  if (result.error || result.status !== 0) throw new Error(`${tool} command failed${result.status === null ? "" : ` (exit ${result.status})`}.`);
}
