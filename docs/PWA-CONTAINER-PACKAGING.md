# PR #92 container packaging — review only

Reference application commit: `d9acb0ec2ecb1ce2d238fd01fdf897e33178ddee`.
This stacked packaging PR targets `dev/pwa-security-validation-20261030`, not main.
Preparation does not authorize a build, workflow dispatch, image publication,
container startup, database operation or production change.

## Pinned inputs

- Platform: Linux/amd64 only.
- Node builder: `22.23.4-bookworm`, platform manifest
  `sha256:94c973596a8581a87ba42746ceb0b0e0b5246d098de45b1ce04dcc967cfc5dfb`.
- Node runtime: `22.23.4-bookworm-slim`, platform manifest
  `sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2`.
- pnpm: `10.34.9`; frozen pnpm lockfile, install lifecycle scripts disabled.
- Trivy: `0.76.1`, Linux-64bit release archive SHA-256
  `c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0`.
- Checkout/upload Actions use full immutable commit SHAs.

Pins were selected using public upstream release and registry manifest metadata.
No image layers or scanner binaries were downloaded during preparation.

## Build isolation and packaging

Network-enabled preparation copies only package/lock/workspace metadata and the
Prisma schema. Exact pnpm is installed with npm scripts disabled. Frozen dependency
installation also disables scripts. Explicit Prisma generation acquires the client
and engines with an unreachable loopback database URL. Only prisma-client-js is
permitted by the static schema-generator check.

This is artifact acquisition, not a domain-level egress allowlist. Public registry,
package integrity and Prisma engine distribution remain supply-chain dependencies.
No production secrets, SSH mounts or credential build arguments are provided.

Application compilation uses RUN --network=none with env -i, unreachable loopback
database URLs and no external integration credentials. The candidate build script
also strips retired migration/bootstrap flags. Do not enable network to fix a
compilation failure. A connection attempt caught by application code may not fail
the build; isolation proves it cannot escape, not that no call was attempted.
The first separately authorized build must verify actual success.

CI creates a source context with git archive from an explicit path list. It rejects
symlinks and obvious credential filenames. Dockerignore denies everything by
default, allows reviewed application trees, then excludes environment files, SSH
keys, dumps, backups, generated dependencies/builds, logs and temporary files.
These controls are not a comprehensive audit for hardcoded secrets in source.

Production dependencies are pruned with network disabled. Runtime contains only
production dependencies, compiled .next, public, package.json and next.config.ts.
It uses ordinary next start; the candidate does not configure standalone output.
Prisma OpenSSL 3 libraries and the CA bundle come from the digest-pinned builder.
Native linkage is checked without starting a service. Runtime uses the node user.
No application source, migration files, seed/build scripts or env files are copied.
Transitive Prisma tooling may remain in the production graph; inspect the SBOM.
No automatic migration, bootstrap or seed startup hook exists.

## Manual workflow — future authorization required

The workflow declares only workflow_dispatch. It has contents:read permissions,
non-persistent checkout credentials, no production environment/secrets, no registry
login/push, no VPS SSH, no services and no application startup. It exports an image
archive directly without loading it into Docker. Only GitHub Actions artifact
storage receives outputs. Artifacts expire after seven days.

GitHub normally requires a workflow_dispatch file on the default branch before
dispatch is available. This stacked Draft PR does not register the file on main.
Do not merge or add a default-branch shim merely to run it. Establish a separately
approved execution path first, such as eventual integration or a dedicated review
repository with an explicitly reviewed repository-identity guard change.

After separate build authorization and workflow availability:

1. Select the exact reviewed packaging commit as the workflow ref. Supply that
   same full SHA as source_sha and BUILD_ISOLATED_ARTIFACT as confirm. SHA/ref drift
   stops the job; a moving branch name alone is not an immutable input.
2. Use an ephemeral native x86_64 Linux runner with Docker/Buildx, at least 5500 MiB
   available RAM and 20000 MiB free disk. Plan initially for 4 vCPUs, 8 GiB RAM and
   30 GiB disk; these are estimates, not measured requirements. Never use the VPS.
3. Run static checks and record source/recipe hashes and Docker/Buildx versions.
4. Build the Linux/amd64 archive with a unique tag containing full source SHA,
   workflow run ID and attempt. Do not load, push or start it.
5. Inspect archive configuration for platform, source label, non-root user, direct
   Next startup, expected environment names and no declared volumes.
6. Acquire checksum-verified Trivy. Generate full final-image vulnerability JSON
   and CycloneDX SBOM. Record vulnerability DB metadata. High/Critical findings,
   unsupported OS, missing prerequisites or a DB older than 48 hours fail closed.
   No unfixed findings, ignore files or scanner failures are silently suppressed.
7. Upload diagnostics even when available security gates fail. Upload the image
   only after every gate succeeds. No failed image is published as an artifact.

Expected outputs:

- image.tar and image.tar.sha256;
- source-sha.txt, recipe.sha256, build-metadata.json and image-identity.json;
- sbom.cdx.json, vulnerabilities.json and vulnerability-db-metadata.json;
- scanner-version.txt, docker-version.txt, buildx-version.txt and evidence.sha256.

Download using the GitHub artifact identity and verify checksums before any later,
separately approved transfer/load. Full image config ID, BuildKit manifest/image
digest and archive SHA-256 are distinct identifiers. No registry digest is invented
for an unpublished image. Retain the complete values, never truncated IDs.

Next generates a random public build marker, so independent rebuilds need not be
byte-identical. Pin inputs, build once and retain/promote the same tested artifact.
The runner image, preinstalled BuildKit and vulnerability DB change over time;
record their versions/metadata rather than claiming byte-level reproducibility.

## Static validation and remaining gates

Read-only policy check: node scripts/container-packaging-static.mjs.
It performs no installation, networking, Docker operation or application execution.
It is not a full YAML/Dockerfile parser, vulnerability scan or runtime test.
JavaScript syntax, Python AST syntax and workflow Bash block syntax can be checked
without executing the workflow or creating an image/test archive.

Preparation validation: policy checks, JavaScript syntax, Python AST parsing,
YAML parsing/structure (using an already installed js-yaml), and syntax-only checks
of all six Bash blocks passed. No dependencies were installed. No Docker parser,
image build, scanner, archive inspector against an actual image, or runtime
acceptance was executed. Packaging remains unproven until an authorized build.

The preparation commit uses [skip ci] so opening this PR does not invoke existing
pull_request build workflows. Do not dispatch any workflow or retry legacy hosting
checks as part of preparation. External GitHub Apps may still add status records;
these are not production deployment evidence or authorization.

Before release, separately authorize build/scans and isolated runtime acceptance:
fresh synthetic database/fixtures, private trusted HTTPS, Windows Chrome/Edge and
physical Android installation, Pilot/Staff sessions/permissions, booking/OFP/PDF,
stubbed ACARS/PIREP ingestion, payroll/wallet idempotency and staff audit logs.
Rehearse both server and installed-worker rollback with retained artifacts/assets.
Never reuse historical review DB dumps, shared STRATOS networks, production secrets
or writable storage. No production release approval is conveyed by this PR.
