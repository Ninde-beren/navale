# syntax=docker/dockerfile:1
# Une image, un port : le serveur Node sert l'API, le temps réel et le build web.
# Étape 1 : dépendances et builds (web par Vite, serveur en un seul fichier par esbuild).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck && pnpm build

# Étape 2 : image finale sans node_modules, le serveur est un fichier, le web un dossier.
FROM node:24-alpine
ARG NAVALE_VERSION=dev
ENV NODE_ENV=production \
    PORT=5251 \
    DATA_DIR=/data \
    WEB_DIST=/app/web \
    NAVALE_VERSION=$NAVALE_VERSION
WORKDIR /app
COPY --from=build /app/apps/server/dist/main.cjs ./server/main.cjs
COPY --from=build /app/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 5251
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:5251/api/health > /dev/null || exit 1
CMD ["node", "server/main.cjs"]
