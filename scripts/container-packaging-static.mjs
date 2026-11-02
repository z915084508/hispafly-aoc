// Read-only source policy checks. Never invokes Docker, installs or runs services.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const docker = read('Dockerfile');
const ignore = read('.dockerignore');
const manual = read('.github/workflows/pwa-container-review.yml');
const validation = read('.github/workflows/pwa-container-validation.yml');
const action = read('.github/actions/pwa-container-artifact/action.yml');
const native = read('scripts/container-native-inventory.mjs');
const sbom = read('scripts/validate-container-sbom.py');
const pins = JSON.parse(read('docker/runtime-packages.json'));
const pkg = JSON.parse(read('package.json'));
const build = read('scripts/build.mjs');
for (const pin of [
  'node:22.23.4-bookworm@sha256:94c973596a8581a87ba42746ceb0b0e0b5246d098de45b1ce04dcc967cfc5dfb',
  'node:22.23.4-bookworm-slim@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2',
]) assert(docker.includes(pin));
assert.equal((docker.match(/^FROM --platform=linux\/amd64 /gm) || []).length, 2);
assert(docker.includes('pnpm@10.34.9 --ignore-scripts'));
assert(docker.includes('pnpm install --frozen-lockfile --ignore-scripts'));
assert(docker.includes('RUN --network=none env -i'));
assert(!/^COPY\s+\.\s/gm.test(docker));
assert(!/--mount=type=(secret|ssh)|--network=host|^ADD\s/gm.test(docker));
const runtime = docker.split(' AS runtime\n')[1];
assert(runtime.includes('USER node'));
assert(runtime.includes('CMD ["node", "node_modules/next/dist/bin/next", "start"'));
assert(!/^ENTRYPOINT\b|^VOLUME\b/gm.test(runtime));
assert(!/^COPY --from=.*lib(?:ssl|crypto)/m.test(runtime), 'raw OpenSSL copy prohibited');
assert(runtime.includes('signed-by=/usr/share/keyrings/debian-archive-keyring.gpg'));
assert(!/allow-unauthenticated|trusted=yes|AllowInsecure|Verify-Peer=false/.test(runtime));
assert.equal(pins.snapshot, '20261102T000000Z');
assert.equal(pins.platform, 'linux/amd64');
assert.deepEqual(pins.packages, { libssl3: '3.0.22-1~deb12u2', openssl: '3.0.22-1~deb12u2', 'ca-certificates': '20230311+deb12u1' });
assert.deepEqual(pins.requiredLibraries, [
  { path: '/usr/lib/x86_64-linux-gnu/libssl.so.3', package: 'libssl3' },
  { path: '/usr/lib/x86_64-linux-gnu/libcrypto.so.3', package: 'libssl3' },
]);
for (const [name, version] of Object.entries(pins.packages)) {
  assert(runtime.includes(`${name}=${version}`));
  assert(/^[a-f0-9]{64}$/.test(pins.debianIndexEvidence[name]));
}
assert(runtime.includes('p.debianIndexEvidence[name]'), 'apt metadata checksum check required');
assert(runtime.includes('/usr/local/lib/aoc-native-inventory.mjs'));
assert(native.includes("run('dpkg', ['--verify', 'libssl3'])"));
assert(native.includes("run('dpkg-query', ['-S', candidate])"));
assert(native.includes('unattributed runtime library:'));
assert(native.includes('libquery_engine-debian-openssl-3.0.x.so.node'));
assert(native.includes("run('ldd', [binary])"));
assert(sbom.includes('requiredLibraries') && sbom.includes('component_for'));
assert(sbom.includes('pkg:deb/') && sbom.includes('pkg:npm/'));
assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
assert.equal(pkg.scripts.start, 'next start');
assert(!pkg.scripts.prestart && !pkg.scripts.poststart && !pkg.scripts.prebuild && !pkg.scripts.postbuild);
assert(build.includes('delete buildEnv.AOC_RUN_MIGRATIONS'));
assert(build.includes('delete buildEnv.AOC_RUN_STAFF_BOOTSTRAP'));
const generators = [...read('prisma/schema.prisma').matchAll(/generator\s+\w+\s*\{([^}]+)\}/g)];
assert.equal(generators.length, 1);
assert(/provider\s*=\s*"prisma-client-js"/.test(generators[0][1]));
assert.equal(ignore.split('\n').find((s) => s && !s.startsWith('#')), '**');
for (const value of ['**/.env', '**/.env.*', '**/.ssh', '**/*.key', '**/*.dump', '!docker/runtime-packages.json']) assert(ignore.includes(value));
const events = (text) => text.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] || '';
assert(/^  workflow_dispatch:/m.test(events(manual)));
assert(!/^  (push|pull_request|schedule|workflow_run):/m.test(events(manual)));
assert(/^  push:/m.test(events(validation)));
assert(!/^  (workflow_dispatch|pull_request|pull_request_target|schedule|workflow_run):/m.test(events(validation)));
assert(events(validation).includes('branches: [codex/pwa92-first-build-validation]'));
assert(events(validation).includes('paths: [docker/pwa-validation-source.txt]'));
assert(validation.includes('git rev-parse HEAD^'));
assert(validation.includes('git diff-tree --no-commit-id --name-only -r HEAD'));
assert(validation.includes('git checkout --detach "$EXPECTED_SHA"'));
assert.equal(read('docker/pwa-validation-source.txt').trim(), 'NOT_AUTHORIZED');
for (const wrapper of [manual, validation]) {
  assert(wrapper.includes('permissions:\n  contents: read\n'));
  assert(wrapper.includes('persist-credentials: false'));
  assert(wrapper.includes('uses: ./.github/actions/pwa-container-artifact'));
}
for (const text of [manual, validation, action]) {
  assert(!/\$\{\{\s*secrets\.|^\s+environment:|^\s+services:|--push\b|--load\b|docker (run|load|push|compose)|\bssh\s|packages: write|id-token: write/.test(text));
  for (const match of text.matchAll(/^\s*(?:- )?uses:\s+([^\s#]+)/gm)) {
    assert(match[1] === './.github/actions/pwa-container-artifact' || /@[a-f0-9]{40}$/.test(match[1]));
  }
}
assert(action.includes('test "${RUNNER_ENVIRONMENT:-}" = github-hosted'));
assert(action.includes('test -z "${DOCKER_HOST:-}"'));
assert(action.includes('driver: docker-container'));
assert(action.includes('version: v0.38.1'));
assert(action.includes('image=moby/buildkit:v0.34.1@sha256:b651bf250c2805569f1db385ad1ea8fb73737dfc851de305f274ca02690fa93f'));
assert(action.includes("awk '/^Driver:/ {print $2}'"));
assert(!/buildx inspect[^\n]*--format/.test(action), 'pinned Buildx inspect has no format flag');
assert(action.includes('docker buildx build --builder "$BUILDER_NAME" --platform linux/amd64'));
assert(action.includes('--output type=docker,dest=out/image.tar'));
assert(action.includes('scripts/validate-container-sbom.py out/image-identity.json'));
assert(action.includes('--severity HIGH,CRITICAL --exit-code 1 --exit-on-eol 1'));
assert(action.includes('sha256sum out/image.tar'));
assert(action.includes('retention-days: 7'));
for (const name of ['Dockerfile', '.dockerignore', '.github/workflows/pwa-container-validation.yml', '.github/actions/pwa-container-artifact/action.yml']) assert(!lstatSync(path.join(root, name)).isSymbolicLink());
console.log('PASS: static source, native-provenance, Buildx and trigger-isolation policy');
