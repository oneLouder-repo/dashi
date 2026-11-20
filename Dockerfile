# Dashi in a container: no dependencies to install, just Node and the code.
#   docker build -t dashi . && docker run -p 8080:8080 -v dashi-data:/data -e BASE_DOMAIN=localhost dashi
# Fly.io builds this with `fly deploy` (see fly.toml and DEPLOY.md).
FROM node:26-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    TRUST_PROXY=true

# Litestream copies the database to a bucket off the server (deploy/litestream.yml).
ARG LITESTREAM_VERSION=0.3.13
ARG TARGETARCH=amd64
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${TARGETARCH}.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz && rm /tmp/litestream.tar.gz && litestream version

WORKDIR /app
COPY . .
RUN mkdir -p /data && chown node:node /data && chmod +x deploy/start.sh

EXPOSE 8080
VOLUME /data

# Hands /data to the unprivileged `node` user, starts Litestream if a bucket
# is attached, and runs Dashi as that user (deploy/start.sh).
CMD ["/app/deploy/start.sh"]
