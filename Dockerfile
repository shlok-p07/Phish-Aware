# syntax=docker/dockerfile:1

# --- deps: install dependencies with Bun, cached separately from source ----
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- builder: build the Next.js app ----------------------------------------
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Only NEXT_PUBLIC_* vars need to be present at build time; runtime secrets
# (MONGODB_URI, etc.) are supplied via the container's environment instead.
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# --- runner: minimal production image --------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
