# NagrikSetu web app (Next.js 14).
#
# Build context is the REPOSITORY ROOT:
#
#   docker build -f packages/web/Dockerfile -t nagriksetu-web .
#
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so they
# must arrive as build args, not only as runtime environment variables.

FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
RUN npm ci --workspace web --include-workspace-root --no-audit --no-fund

COPY packages/web ./packages/web

# Empty is a supported configuration: the app falls back to bundled fixtures.
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
# Demo sign-in works only while NEXT_PUBLIC_SUPABASE_URL is empty (offline mode).
ARG NEXT_PUBLIC_DEMO_AUTH="true"
ARG NEXT_PUBLIC_DEMO_AUDIT="false"
# Skip the sign-in screen: land on the dashboard as the demo citizen.
ARG NEXT_PUBLIC_AUTO_LOGIN="false"
ARG NEXT_PUBLIC_SUPPORT_EMAIL=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_DEMO_AUTH=$NEXT_PUBLIC_DEMO_AUTH
ENV NEXT_PUBLIC_DEMO_AUDIT=$NEXT_PUBLIC_DEMO_AUDIT
ENV NEXT_PUBLIC_AUTO_LOGIN=$NEXT_PUBLIC_AUTO_LOGIN
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/packages/web
RUN npm run build


FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/packages/web ./packages/web

# Server-side only. Defaults to the compose service name.
ENV NAGRIKSETU_API_URL=http://backend:8000
ENV PORT=3000

WORKDIR /app/packages/web
EXPOSE 3000

CMD ["npm", "run", "start"]
