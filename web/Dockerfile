# syntax=docker/dockerfile:1

# Static front end served by nginx. The "unprivileged" variant of the
# official image runs as a non-root user (uid 101) on port 8080, which the
# cluster's "restricted" Pod Security Standard requires.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine

ARG APP_VERSION=dev
ARG GIT_SHA=unknown

LABEL org.opencontainers.image.title="lakify-web" \
      org.opencontainers.image.description="Lakify front end (nginx)" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

# Where nginx forwards /api/ requests: the lakify-api Service in the same
# Kubernetes namespace. Override it to run the image elsewhere.
ENV API_UPSTREAM=lakify-api:80

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY lakify.html lakify.css lakify.js /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
