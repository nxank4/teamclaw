# TeamClaw — multi-stage Docker build
# Build:  docker compose build
# Run:    docker compose up -d

FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ── Production ─────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

# Data directories (mounted as volume in production)
RUN mkdir -p /home/node/.teamclaw/memory /home/node/.teamclaw/sessions \
    /home/node/.teamclaw/cache /home/node/.teamclaw/templates \
    && chown -R node:node /home/node/.teamclaw /app

RUN chmod +x /app/dist/cli.js

USER node

ENV NODE_ENV=production
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q -O- http://localhost:8000/ || exit 1

CMD ["node", "/app/dist/cli.js", "web", "-p", "8000"]
