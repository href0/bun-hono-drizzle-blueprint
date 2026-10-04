# -------------------------------------------------------------------
# Stage 1: Base Image & Dependencies
# -------------------------------------------------------------------
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# -------------------------------------------------------------------
# Stage 2: Install Production Dependencies
# -------------------------------------------------------------------
FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# -------------------------------------------------------------------
# Stage 3: Production Runtime
# -------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
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
  CMD bun -e "fetch('http://localhost:3000/api/v1/health/liveness').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start application server
CMD ["bun", "run", "start"]
