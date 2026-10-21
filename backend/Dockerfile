# NagrikSetu backend (Layer 2 HTTP API).
#
# Build context is the REPOSITORY ROOT, not this directory, because the service
# is an npm workspace and needs the root package.json + package-lock.json to
# install reproducibly:
#
#   docker build -f backend/Dockerfile -t nagriksetu-backend .
#
# Node 24 is required: the service runs TypeScript directly (`node src/index.ts`)
# using Node's built-in type stripping.

FROM node:24-bookworm-slim

WORKDIR /app

# Install only this workspace's dependencies. Using the ROOT lockfile is what
# keeps a fresh clone from resolving a different `express` than the one this
# service declares - see backend/src/app.ts for why that matters.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --workspace nagriksetu-backend --include-workspace-root --omit=dev --no-audit --no-fund

COPY backend ./backend

ENV NODE_ENV=production
# Offline by default: the container starts and serves with no credentials.
ENV NAGRIKSETU_DISABLE_DB=1
ENV NAGRIKSETU_DISABLE_LLM=1
ENV PORT=8000

WORKDIR /app/backend
EXPOSE 8000

# `node src/index.ts` - no build step; Node strips the types at load.
CMD ["node", "src/index.ts"]
