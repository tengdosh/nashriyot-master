# Read-only Telegram bot — isolated service. Build context = repo root:
#   docker compose -f deploy/docker-compose.prod.yml build bot
FROM node:22-slim

WORKDIR /app

# Deps come from the root package (grammy, @anthropic-ai/sdk, zod, tsx).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# Only the pieces the bot actually loads: pure lib + bot source + tsconfig
# (for the @/ path alias resolved by tsx). The bot never imports the DB layer.
COPY tsconfig.json ./
COPY lib ./lib
COPY bot ./bot

ENV NODE_ENV=production
CMD ["npx", "tsx", "bot/src/index.ts"]
