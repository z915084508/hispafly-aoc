# BuildKit required. These manifest pins support linux/amd64 only.
FROM --platform=linux/amd64 node:22.23.4-bookworm@sha256:94c973596a8581a87ba42746ceb0b0e0b5246d098de45b1ce04dcc967cfc5dfb AS dependencies
WORKDIR /app
ENV CI=true
# Network-enabled acquisition has no application source or production credentials.
RUN npm install --global pnpm@10.34.9 --ignore-scripts --no-audit --no-fund
RUN --network=none test "$(node --version)" = v22.23.4 && test "$(pnpm --version)" = 10.34.9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY prisma/schema.prisma ./prisma/schema.prisma
# Acquire the generated client/engines before network-disabled compilation.
RUN env -i PATH="$PATH" HOME=/root CHECKPOINT_DISABLE=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:1/build_unreachable \
    pnpm exec prisma generate --schema prisma/schema.prisma

FROM dependencies AS compile
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.mjs eslint.config.mjs ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
# No inherited credentials; attempted DB/API requests cannot escape the build.
RUN --network=none env -i PATH="$PATH" HOME=/root NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:1/build_unreachable \
    DIRECT_URL=postgresql://build:build@127.0.0.1:1/build_unreachable \
    node scripts/build.mjs
RUN --network=none node --test scripts/build-safety.test.mjs && \
    node --experimental-strip-types --test scripts/pwa.test.mjs && \
    node -e "require('sharp'); require('@prisma/client')"

FROM compile AS production-dependencies
RUN --network=none pnpm prune --prod --ignore-scripts && \
    node -e "require('sharp'); require('@prisma/client')"

FROM --platform=linux/amd64 node:22.23.4-bookworm-slim@sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/z915084508/hispafly-aoc" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
# Prisma OpenSSL 3 libraries and CA bundle come from the digest-pinned builder.
COPY --from=dependencies /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3
COPY --from=dependencies /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3
COPY --from=dependencies /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=compile --chown=node:node /app/.next ./.next
COPY --from=compile --chown=node:node /app/public ./public
COPY --from=compile --chown=node:node /app/package.json /app/next.config.ts ./
# Check native linkage without starting a service. Missing libraries fail closed.
RUN --network=none find node_modules -type f -name '*.node' -exec sh -c \
    'for f do output=$(ldd "$f" 2>&1) || exit 1; case "$output" in *"not found"*) printf "%s\n" "$output"; exit 1;; esac; done' sh {} + && \
    node -e "require('sharp'); require('@prisma/client')"
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
