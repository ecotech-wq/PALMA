#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
# Mini migrateur en JS pur (utilise pg, pas la CLI Prisma → pas de problème
# de transitive deps dans l'image standalone).
# Retry au cas où Postgres n'est pas encore prêt.
for i in 1 2 3 4 5 6; do
  if node /app/docker/migrate.cjs; then
    break
  fi
  echo "[entrypoint] migrate failed (attempt $i), retrying in 5s..."
  sleep 5
done

echo "[entrypoint] Starting app on port ${PORT:-3000}..."
exec "$@"
