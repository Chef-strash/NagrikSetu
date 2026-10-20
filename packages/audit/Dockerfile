# NagrikSetu document-audit service (Node, port 8787).
#
# Build context is the REPOSITORY ROOT:
#
#   docker build -f packages/audit/Dockerfile -t nagriksetu-audit .
#
# Needs the sibling workspaces @nagriksetu/agents and @nagriksetu/documents, so all three
# are installed from the ROOT lockfile and compiled in dependency order.
#
# OCR language data (eng+hin+mar): tesseract.js downloads each .traineddata from its
# CDN on first use and caches it. For a fully offline container either
#   - build with --build-arg BAKE_TESSDATA=true (downloads at BUILD time), or
#   - mount a directory of <lang>.traineddata at /tessdata (AUDIT_TESSDATA_DIR=/tessdata).

FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/agents/package.json ./packages/agents/
COPY packages/documents/package.json ./packages/documents/
COPY packages/audit/package.json ./packages/audit/
RUN npm ci --workspace @nagriksetu/audit --workspace @nagriksetu/agents --workspace @nagriksetu/documents \
    --include-workspace-root --no-audit --no-fund

COPY packages/agents ./packages/agents
COPY packages/documents ./packages/documents
COPY packages/audit ./packages/audit

# Build in dependency order through npm's script runner (as the root `build:libs`
# script does). The lockfile nests typescript under each workspace
# (packages/*/node_modules/typescript), so there is NO tsc in the root
# node_modules/.bin: a bare `npx tsc` would download the unrelated tsc@2.0.4
# package and fail with "This is not the tsc command you are looking for".
# `npm run` prepends the workspace's own node_modules/.bin to PATH, which is what
# makes `tsc` resolve to that workspace's TypeScript.
RUN npm run build --workspace @nagriksetu/agents \
 && npm run build --workspace @nagriksetu/documents \
 && npm run build --workspace @nagriksetu/audit

ARG BAKE_TESSDATA=false
RUN mkdir -p /tessdata && if [ "$BAKE_TESSDATA" = "true" ]; then \
      node -e "const fs=require('fs');(async()=>{for(const l of ['eng','hin','mar']){const r=await fetch('https://github.com/tesseract-ocr/tessdata_fast/raw/main/'+l+'.traineddata');if(!r.ok)throw new Error(l+' '+r.status);fs.writeFileSync('/tessdata/'+l+'.traineddata',Buffer.from(await r.arrayBuffer()))}})()"; \
    fi


FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /tessdata /tessdata

# 127.0.0.1 (the default) is unreachable from other containers.
ENV AUDIT_HOST=0.0.0.0
ENV AUDIT_PORT=8787

WORKDIR /app/packages/audit
EXPOSE 8787

CMD ["node", "dist/cli.js", "serve"]
