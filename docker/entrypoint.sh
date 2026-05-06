#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
# Retry up to 30s : Postgres peut ne pas être prêt immédiatement
for i in 1 2 3 4 5 6; do
  if npx prisma migrate deploy --schema=./prisma/schema.prisma; then
    break
  fi
  echo "[entrypoint] migrate deploy failed (attempt $i), retrying in 5s..."
  sleep 5
done

echo "[entrypoint] Starting app on port ${PORT:-3000}..."
exec "$@"
