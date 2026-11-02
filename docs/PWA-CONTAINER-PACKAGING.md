# PWA Docker prerequisites — preparation only

Application baseline: PR #92, `d9acb0ec2ecb1ce2d238fd01fdf897e33178ddee`.
Packaging baseline: PR #93, `96153c2ede1ff8a929b9b155c375713234766f51`.
This follow-up targets `codex/pwa92-container-packaging` from a separate branch.
No production change, build, workflow execution, migration or merge is authorized
by preparing/reviewing these files. Do not reuse historical review resources.

## Immutable inputs

- Platform: Linux/amd64; Node 22.23.4; pnpm 10.34.9.
- Builder: `node:22.23.4-bookworm@sha256:94c973596a8581a87ba42746ceb0b0e0b5246d098de45b1ce04dcc967cfc5dfb`.
- Runtime: `node:22.23.4-bookworm-slim@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2`.
- Buildx CLI v0.38.1, setup action commit
  `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f`.
- Builder driver: docker-container. BuildKit:
  `moby/buildkit:v0.34.1@sha256:b651bf250c2805569f1db385ad1ea8fb73737dfc851de305f274ca02690fa93f`.
- Debian and Debian-security snapshots: `20261102T000000Z`.
- libssl3 and openssl: `3.0.22-1~deb12u2`; ca-certificates: `20230311+deb12u1`.
  Exact package SHA-256 values are in docker/runtime-packages.json.
- Trivy 0.76.1 Linux-64bit release archive SHA-256:
  `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0`.
- Checkout/upload Actions use full immutable commit SHAs.

Only public release, manifest and package-index metadata was read to select pins.
No image layers, binary tools or Debian packages were downloaded in preparation.

## Build and runtime boundaries

Frozen dependency acquisition disables lifecycle scripts. Explicit Prisma client
generation uses an unreachable loopback database placeholder. Application source
is copied only after this preparation stage. Compilation runs with network=none,
env -i, no production credentials and unreachable loopback DB URLs. Dependency
acquisition is network-enabled, not a domain-level egress allowlist. Never enable
compilation network access to bypass a failure. Caught connection errors do not
prove no attempt occurred; isolation prevents attempts reaching real services.

The runtime installs exact Debian packages through apt/dpkg, with Debian archive
signature verification and package-index checksum checks. Only expired snapshot
Valid-Until checks are disabled. A builder CA bundle bootstraps HTTPS; the pinned
ca-certificates package is subsequently installed and registered. No raw OpenSSL
library is copied between stages. Fixed snapshots also constrain dependencies.

The runtime inventory runs during a future build without network or DB access:

1. Verify installed package versions and dpkg verification of libssl3 files.
2. Check the OpenSSL CLI version and generated Prisma OpenSSL-3 engine presence.
3. Run ldd on Node, OpenSSL and packaged native modules/shared libraries; fail on
   missing dependencies. This is linkage validation, not a real Prisma DB query.
4. Attribute every resolved library to a real installed dpkg package, or an npm
   package manifest for bundled npm libraries such as sharp/libvips. Unknown owners
   fail. OS OpenSSL libraries must specifically belong to the pinned libssl3.
5. Record hashes, owners and versions in runtime-native-inventory.json.

The archive inspector reads this generated inventory from image layers without
extracting/loading/running the image. The SBOM gate matches every native-library
owner to its exact version and package-manager PURL in CycloneDX. Both libssl.so.3
and libcrypto.so.3 must map to the pinned libssl3 component; Debian packages both
libraries together, so no fictional separate libcrypto package is required.

Runtime uses the node user and ordinary next start, with pruned dependencies,
generated Prisma client, .next/public and configuration. No application migration,
seed/bootstrap startup hook or production environment file is included. Retained
transitive CLI tooling must be assessed from the actual SBOM. Native and runtime
compatibility remain unproven until an authorized build/startup acceptance.

## Shared build action

Both workflows call .github/actions/pwa-container-artifact at the checked-out
reviewed source. It rejects self-hosted/non-Linux runners, remote Docker endpoint
overrides and non-default Docker contexts before creating build infrastructure.
Use an ephemeral GitHub-hosted x86_64 runner with at least 5500 MiB available RAM
and 20000 MiB free disk; plan initially for 4 vCPUs, 8 GiB RAM and 30 GiB disk.
These are planning budgets, not measured application requirements.

Only a future authorized execution creates a uniquely named BuildKit container and
its isolated state. The action disables automatic image loading and insecure
entitlements, and removes builder/state on cleanup. It checks the effective driver,
running status, BuildKit version, platform and immutable image option from inspect
output before explicitly selecting that builder for Docker archive export.

Buildx inspect v0.38.1 has no --format option. Its text output is recorded and
validated. No production daemon, registry push, Docker load or application startup
is used. BuildKit infrastructure containers are distinct from application services;
their future creation still requires explicit build authorization.

Context is an explicit git archive plus default-deny dockerignore. No .git, env
files, local dependencies, dumps, backups, keys, logs or temporary build outputs
are admitted. This is not a comprehensive hardcoded-secret/history audit.

## Trigger isolation

Manual workflow: workflow_dispatch only, full SHA/ref equality and confirmation.
It remains subject to GitHub's default-branch registration requirement. Do not
merge to main or add a shim just to make dispatch available.

Branch workflow: push only on `codex/pwa92-first-build-validation`, and only changes
to `docker/pwa-validation-source.txt`. Preparation is pushed to a different branch.
The reserved validation branch is not created or pushed during preparation.
The tracked authorization file initially contains NOT_AUTHORIZED, not a SHA.

The branch job checks that its event commit is a single-parent commit changing
exactly that one file. Its contents must be the exact parent SHA, and the parent
must still contain NOT_AUTHORIZED. It then checks out/builds the reviewed parent,
not the authorization-only commit. Labels and recipe identities use that parent.
The shared action rechecks the checkout SHA and all packaging policies.

Both wrappers have contents:read, non-persistent checkout credentials, no production
environment/secrets, no deployment/SSH, no real database access or external API
writes, and no auto-merge. No repository permissions or settings are broadened.
Preparation commits use [skip ci] to avoid existing automatic PR workflows. No
existing workflow or legacy hosting check is disabled, dispatched or retried.

## Exact procedure for a future authorized first build

Do not execute these steps as part of preparation:

1. Review the complete follow-up PR. Record its full reviewed head SHA as S. Verify
   its parent is the PR #93 baseline and the diff contains only packaging changes.
   Recheck pins, scans policy, artifact visibility, runner availability and that
   the reserved branch does not exist. Obtain explicit authorization for one build.
2. Create the reserved validation branch at S. The preparation commit's [skip ci]
   marker avoids a build on branch creation; the NOT_AUTHORIZED sentinel also
   prevents the build guard passing. Do not create a PR from this branch.
3. Create one child commit of S changing only docker/pwa-validation-source.txt to
   S plus newline. Use an explicit authorization message without a skip marker.
   Verify the diff is exactly that one file. Push only to the reserved branch.
   This explicit push is the authorized trigger; no workflow dispatch is needed.
4. The guard verifies parent/diff/SHA and builds S on a fresh hosted runner. No
   production, existing review network, database, volume or secret is available.
5. Retain source/recipe hashes, builder evidence, complete image identity, archive
   SHA-256, SBOM, native-inventory validation and all vulnerability findings. Do not
   weaken gates if the first build fails. Diagnose and review a new source revision.
6. Stop after artifact verification. Do not transfer/load/run/deploy it. Fresh
   synthetic DB fixtures, private HTTPS, Windows/Android installation, authenticated
   AOC operations and server/worker rollback need separate acceptance authorization.

The same authorization commit cannot authorize a different source. To retry, first
obtain separate authorization and re-establish the reserved branch at a reviewed
source containing NOT_AUTHORIZED. Do not force-push or reset refs without approval.

## Security outputs and public visibility

Trivy generates final-image vulnerability JSON and CycloneDX SBOM. Missing scanner,
SBOM provenance failure, stale DB (>48 hours), unsupported OS or High/Critical
findings block image upload. No unfixed findings or failures are suppressed.

Outputs: image.tar/image.tar.sha256; source-sha.txt; recipe.sha256;
build-metadata.json; image-identity.json (including native inventory);
builder-inspect.txt; sbom.cdx.json; sbom-native-validation.json;
vulnerabilities.json; vulnerability-db-metadata.json; scanner-version.txt;
docker-version.txt; buildx-version.txt; evidence.sha256.
Diagnostics upload when available after failures; image upload requires every gate.
Retention is seven days. This repository is PUBLIC: signed-in users with repository
read access can download artifacts. These outputs are not owner-only/confidential.
No secrets or private production data may be included. If private artifacts are
required, stop and obtain approval for a separate private execution/storage design.

Config image ID, BuildKit digest and archive SHA-256 are distinct. Never invent a
registry digest for an unpublished image. Verify all complete identifiers before
any separately approved transfer/load. Next's random public build marker and
evolving hosted runner/scanner DB mean independent rebuilds need not be bit-identical.
Build once and retain the same tested artifact.

## Static validation

node scripts/container-packaging-static.mjs is read-only and dependency-free.
YAML parsing, JavaScript syntax, Python AST and Bash -n checks are permitted; none
creates a builder, executes Docker, installs dependencies or touches the VPS.
Static checks cannot establish real apt availability/signature success, native
linkage, offline compilation, SBOM coverage or vulnerability status. The first
authorized build must establish those facts and may fail safely.

Preparation checks passed: source policy, JavaScript syntax, Python AST parsing,
YAML parsing/structure, all nine workflow Bash blocks and all Docker RUN shell
syntax. Existing local parsers were used; no dependencies were installed. Public
registry metadata verified the BuildKit amd64 digest, and official Debian snapshot
package indexes supplied the recorded versions/checksums. The reserved branch was
absent when inspected. It was not created or pushed. No Docker operation, workflow,
scanner, package installation or production/VPS access was executed.
