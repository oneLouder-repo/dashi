#!/bin/sh
# Start Dashi in its container (see Dockerfile).
#  1. A host's disk is mounted over /data as root: hand it to the unprivileged `node` user.
#  2. With a bucket attached (BUCKET_NAME), Litestream first restores the
#     database if the disk is new and empty, then runs Dashi and copies every
#     change to the bucket while it runs.
#  3. Without one, Dashi runs on its own (daily snapshots still happen).
set -e
chown -R node:node /data
AS_NODE="setpriv --reuid=node --regid=node --init-groups"
APP="node --disable-warning=ExperimentalWarning server.js"

if [ -n "$BUCKET_NAME" ] && command -v litestream >/dev/null 2>&1; then
  $AS_NODE litestream restore -config /app/deploy/litestream.yml -if-db-not-exists -if-replica-exists /data/toolbox.db
  exec $AS_NODE litestream replicate -config /app/deploy/litestream.yml -exec "$APP"
fi
exec $AS_NODE $APP
