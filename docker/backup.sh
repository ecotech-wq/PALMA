#!/bin/sh
# Sauvegarde quotidienne Postgres : pg_dump → /backups/ogc-YYYY-MM-DD.sql.gz
# Conserve les 30 derniers jours.

set -eu

DATE=$(date +%Y-%m-%d-%H%M)
OUT="/backups/ogc-${DATE}.sql.gz"

echo "[$(date)] Dumping Postgres → ${OUT}"
pg_dump --no-owner --clean --if-exists | gzip -9 > "${OUT}"

# Purge : garder seulement les 30 derniers fichiers
ls -1t /backups/ogc-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "[$(date)] OK ($(du -h "${OUT}" | cut -f1))"
