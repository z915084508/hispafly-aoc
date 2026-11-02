// Read-only policy checks; no dependencies, Docker, networking or services.
import assert from "node:assert/strict";
import { readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFileSync(path.join(root, name), "utf8");
const docker = read("Dockerfile");
const ignore = read(".dockerignore");
const workflow = read(".github/workflows/pwa-container-review.yml");
const schema = read("prisma/schema.prisma");
const pkg = JSON.parse(read("package.json"));
const build = read("scripts/build.mjs");
for (const pin of [
  "node:22.23.4-bookworm@sha256:94c973596a8581a87ba42746ceb0b0e0b5246d098de45b1ce04dcc967cfc5dfb",
  "node:22.23.4-bookworm-slim@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2",
]) assert(docker.includes(pin), "unreviewed base image");
assert.equal((docker.match(/^FROM --platform=linux\/amd64 /gm) || []).length, 2);
assert(docker.includes("pnpm@10.34.9 --ignore-scripts"));
assert(docker.includes("pnpm install --frozen-lockfile --ignore-scripts"));
assert(docker.includes("RUN --network=none env -i"));
assert(!/^COPY\s+\.\s/gm.test(docker), "broad context copy");
assert(!/--mount=type=(secret|ssh)|--network=host|^ADD\s/gm.test(docker));
const runtime = docker.split(" AS runtime\n")[1];
assert(runtime && runtime.includes("USER node"));
assert(runtime.includes('CMD ["node", "node_modules/next/dist/bin/next", "start"'));
assert(!/^ENTRYPOINT\b|^VOLUME\b/gm.test(runtime));
assert(!/COPY.*(?:\/app\/src|\/app\/scripts|\/app\/prisma|\.env)/.test(runtime));
assert(!/\b(?:migrate|bootstrap|seed)\b/.test(runtime.split("\n").filter((s) => !s.startsWith("#")).join("\n")));
assert.equal(pkg.scripts.build, "node scripts/build.mjs");
assert.equal(pkg.scripts.start, "next start");
assert(!pkg.scripts.prestart && !pkg.scripts.poststart && !pkg.scripts.prebuild && !pkg.scripts.postbuild);
assert(build.includes('delete buildEnv.AOC_RUN_MIGRATIONS'));
assert(build.includes('delete buildEnv.AOC_RUN_STAFF_BOOTSTRAP'));
assert(!/run\([^\n]*(?:migrate|bootstrap|seed)/.test(build));
const generators = [...schema.matchAll(/generator\s+\w+\s*\{([^}]+)\}/g)];
assert.equal(generators.length, 1);
assert(/provider\s*=\s*"prisma-client-js"/.test(generators[0][1]));
assert.equal(ignore.split("\n").find((s) => s && !s.startsWith("#")), "**");
for (const pattern of ["**/.env", "**/.env.*", "**/node_modules", "**/.next", "**/.git", "**/.ssh", "**/*.key", "**/*.pem", "**/*.dump", "**/*.sql", "**/*.log", "**/tmp"]) assert(ignore.includes(pattern));
const eventSection = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1];
assert(eventSection && /^  workflow_dispatch:/m.test(eventSection));
assert(!/^  (?:push|pull_request|pull_request_target|schedule|workflow_run):/m.test(eventSection));
assert(workflow.includes("permissions:\n  contents: read\n"));
assert(!/\$\{\{\s*secrets\.|^\s+environment:|^\s+services:|--push\b|--load\b|docker (?:run|load|push|compose)|\bssh\s|packages: write|id-token: write/.test(workflow));
assert(workflow.includes('test "$EXPECTED_SHA" = "$GITHUB_SHA"'));
assert(workflow.includes("persist-credentials: false"));
assert(workflow.includes("git archive"));
assert(workflow.includes("--platform linux/amd64"));
assert(workflow.includes("--output type=docker,dest=out/image.tar"));
assert(workflow.includes("--severity HIGH,CRITICAL --exit-code 1 --exit-on-eol 1"));
assert(workflow.includes("c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0"));
for (const match of workflow.matchAll(/^\s*(?:- )?uses:\s+([^\s#]+)/gm)) assert(/@[a-f0-9]{40}$/.test(match[1]), "action must use immutable commit");
for (const name of ["Dockerfile", ".dockerignore", ".github/workflows/pwa-container-review.yml", "scripts/container-artifact.py"]) assert(!lstatSync(path.join(root, name)).isSymbolicLink());
console.log("PASS: static container packaging policy (no build/runtime validation)");
