# Stage 1: Builder
FROM node:20-slim AS builder
WORKDIR /app

# Install minimal build dependencies (no canvas/puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --network-timeout 600000 --network-concurrency 1 --production=false

COPY prisma ./prisma
RUN yarn prisma:generate

COPY tsconfig*.json ./
COPY src ./src

RUN yarn build


# Stage 2: Production Dependencies (minimal)
FROM node:20-slim AS deps
WORKDIR /app

# Install minimal build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
COPY prisma ./prisma

# Install production deps and clean up aggressively
RUN yarn install --frozen-lockfile --network-timeout 600000 --network-concurrency 1 --production && \
  yarn cache clean && \
  # Remove build tools after native modules are compiled
  apt-get purge -y build-essential python3 && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
  # Remove unnecessary files from node_modules
  find /app/node_modules -name "*.md" -delete && \
  find /app/node_modules -name "*.ts" -not -name "*.d.ts" -delete && \
  find /app/node_modules -name "*.map" -delete && \
  # Only remove test directories at the package root level (depth 2)
  find /app/node_modules -maxdepth 2 -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true && \
  find /app/node_modules -maxdepth 2 -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
  find /app/node_modules -maxdepth 2 -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true && \
  find /app/node_modules -maxdepth 2 -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true


# Stage 3: Runner (ultra-minimal)
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install curl (health checks), git (GitHub push), wget (Koyeb CLI)
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl \
  ca-certificates \
  git \
  wget \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
  && apt-get clean

# Install Koyeb CLI
RUN curl -fsSL https://raw.githubusercontent.com/koyeb/koyeb-cli/master/install.sh | sh \
  && mv /root/.koyeb/bin/koyeb /usr/local/bin/koyeb \
  || echo "Koyeb CLI install skipped (non-critical)"

RUN addgroup --system nodejs && \
  adduser --system --ingroup nodejs nestjs && \
  chown -R nestjs:nodejs /app

# Create storage directories for zip processing with proper ownership
RUN mkdir -p /app/zipstorage /app/unzipstorage && \
  chown -R nestjs:nodejs /app/zipstorage /app/unzipstorage

COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --chown=nestjs:nodejs package.json ./

USER nestjs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "--max_old_space_size=2048", "dist/main"]
