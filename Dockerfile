# syntax=docker/dockerfile:1

# ---- OpenCode CLI ------------------------------------------------------------
# The web container starts one isolated server per signed-in user, so it needs
# the same OpenCode binary the standalone container used to run.
FROM ghcr.io/anomalyco/opencode:2.2.2 AS opencode

# ---- Dependencies -----------------------------------------------------------
FROM node:22-alpine3.24 AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ------------------------------------------------------------------
FROM node:22-alpine3.24 AS builder
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

RUN npm run build

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

COPY --from=opencode /usr/local/bin/opencode /usr/local/bin/opencode
RUN chmod 0755 /usr/local/bin/opencode

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
