# Kicktro API. Same base image talebindery pins on the same VPS, so its layers are already
# on disk there. No npm install: the server uses only Node's built-in modules.
FROM node:24.21.0-bookworm-slim

WORKDIR /app
COPY *.js ./

# Named volumes take their ownership from the image on first creation, so these must exist
# and belong to `node` before the volumes are mounted over them.
RUN mkdir -p /data /thumbs && chown node:node /data /thumbs

ARG GIT_REV=dev
ENV NODE_ENV=production GIT_REV=$GIT_REV PORT=8080 DB_PATH=/data/kicktro.db THUMB_DIR=/thumbs
USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "--disable-warning=ExperimentalWarning", "main.js"]
