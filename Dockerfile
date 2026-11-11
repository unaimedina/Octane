# syntax=docker/dockerfile:1

# ---- OpenCode CLI ------------------------------------------------------------
# The web container starts one isolated server per signed-in user, so it needs
# the same OpenCode binary the standalone container used to run.
FROM ghcr.io/anomalyco/opencode:2.2.2 AS opencode

# ---- Dependencies -----------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine3.24 AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- Build ------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine3.24 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build contexts copied from older checkouts can still contain the removed
# Claude Code harness routes. They import modules that no longer exist, so
# remove them before compiling. Clean checkouts are unaffected.
RUN rm -rf "src/app/api/harness" "src/app/api/harnesses" "src/app/api/sessions/[id]/handoff" \
  && rm -f "src/lib/claude-auth.ts" "src/lib/claude-events.ts" "src/lib/claude-sessions.ts" "src/lib/harnesses.ts" \
  && rm -f "src/components/settings/claude-auth.tsx"

RUN --mount=type=cache,target=/app/.next/cache npm run build

# ---- Native modules for the target platform ---------------------------------
# deps/builder run on the build machine's platform for speed. The standalone
# bundle is plain JavaScript except for sharp (traced by next/image), whose
# prebuilt binary must match the image's platform. Reinstall the exact locked
# sharp version here and swap it into the standalone node_modules.
FROM node:22-alpine3.24 AS native
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY package-lock.json /tmp/package-lock.json
RUN --mount=type=cache,target=/root/.npm \
    SHARP_VERSION="$(node -p "require('/tmp/package-lock.json').packages['node_modules/sharp'].version")" \
  && mkdir -p /tmp/sharp && cd /tmp/sharp \
  && npm init -y >/dev/null \
  && npm install --no-audit --no-fund --omit=dev "sharp@${SHARP_VERSION}" \
  && rm -rf /app/node_modules/sharp /app/node_modules/@img \
  && cp -R /tmp/sharp/node_modules/. /app/node_modules/ \
  && cd /app && node -e "require('sharp'); console.log('sharp ok on', process.arch)" \
  && OTHER_NATIVE="$(find /app/node_modules -name '*.node' -not -path '*/@img/*')" \
  && if [ -n "$OTHER_NATIVE" ]; then echo "Unexpected native modules built for the build platform:"; echo "$OTHER_NATIVE"; exit 1; fi \
  && rm -rf /tmp/sharp /tmp/package-lock.json

# ---- Runtime ----------------------------------------------------------------
FROM node:22-alpine3.24 AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/nextjs

# Runtime tools used by the file browser, skills, git integration and the
# per-user OpenCode servers started by the web process.
RUN apk add --no-cache git bash ripgrep ca-certificates libgcc libstdc++

RUN addgroup -S -g 1001 nodejs \
  && adduser -S -u 1001 -G nodejs nextjs \
  && mkdir -p /home/nextjs/.config/opencode/skills \
     /home/nextjs/.local/share/octane/users \
     /home/nextjs/.local/share/octane-data \
  && chown -R nextjs:nodejs /home/nextjs

# Persist OCTANE data and per-user OpenCode data even when a compose file does
# not mount volumes here: Docker keeps anonymous volumes when a container is
# recreated (e.g. `docker compose pull && docker compose up -d`). Named volumes
# or bind mounts in compose take precedence. Back them up as described in README.
VOLUME ["/home/nextjs/.local/share/octane-data", "/home/nextjs/.local/share/octane/users"]

COPY --from=opencode /usr/local/bin/opencode /usr/local/bin/opencode
RUN chmod 0755 /usr/local/bin/opencode

COPY --from=builder /app/public ./public
COPY --from=native --chown=nextjs:nodejs /app ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
