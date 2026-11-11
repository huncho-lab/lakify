# syntax=docker/dockerfile:1

# Exact base image tag so builds are reproducible. Keep it in step with .nvmrc.
ARG NODE_IMAGE=node:22.14.0-alpine3.21

# ---- Stage 1: install production dependencies only ----------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci installs exactly what the lockfile says; dev tools (Jest, ESLint)
# are left out because the pipeline runs tests before the image is built.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- Stage 2: runtime image ---------------------------------------------
FROM ${NODE_IMAGE} AS runtime

# Build metadata, passed in by CI and reported by GET /version.
ARG APP_VERSION=dev
ARG GIT_SHA=unknown

ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA}

LABEL org.opencontainers.image.title="lakify-api" \
      org.opencontainers.image.description="REST API for Lakify" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

# The app runs with plain `node`, so npm and yarn are not needed at runtime.
# Removing them keeps them out of the container's filesystem, so they cannot
# be run and image scanners do not flag their dependencies. (It does not
# shrink the download: the files still exist in the base image layer.)
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app

# Files are owned by root and are read-only to the app user.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# The official image comes with an unprivileged `node` user (uid 1000).
USER node

EXPOSE 3000

# Uses Node's built-in fetch, so no curl or wget is needed in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Run node directly (not via npm) so SIGTERM from Kubernetes reaches the
# graceful shutdown handler in server.js.
CMD ["node", "src/server.js"]
