# Two images from one build (deployment guide: docs/deployment.md):
#   docker build -t app .                    # runner: the API only, production dependencies
#   docker build --target tools -t app-tools .  # one-off jobs: db:migrate, seed:admin, auth:purge-tokens
#
# Dependencies are installed with --ignore-scripts: the root `prepare` script runs husky, a
# devDependency that is absent from a production install (and there is no .git in the image).

# -------------------------------------------------------------------
# Stage 1: Base Image
# -------------------------------------------------------------------
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# -------------------------------------------------------------------
# Stage 2: Install Production Dependencies
# -------------------------------------------------------------------
FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# -------------------------------------------------------------------
# Stage 3: Tools (migrations, seeding, maintenance) — all dependencies, scripts, drizzle config
# -------------------------------------------------------------------
FROM base AS tools
ENV TZ=UTC
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY scripts ./scripts
USER bun
CMD ["bun", "run", "db:migrate"]

# -------------------------------------------------------------------
# Stage 4: Production Runtime (default target)
# -------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3000

# Security: Run container as non-root user 'bun'
USER bun

# Copy installed production dependencies and source files
COPY --chown=bun:bun --from=dependencies /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock tsconfig.json ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun drizzle ./drizzle

# Expose HTTP port
EXPOSE 3000

# Health check using Bun fetch against liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health/liveness').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start application server
CMD ["bun", "run", "start"]
