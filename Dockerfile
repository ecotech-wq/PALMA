# =====================================================================
# Image Docker production de l'app Autonhome (Next.js standalone)
# =====================================================================

# ---------- Stage 1 : dépendances ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Sharp et Prisma préfèrent libc-dev sur Alpine
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copie le schéma Prisma pour que `npm postinstall` (s'il y en a) puisse passer
COPY prisma ./prisma
COPY prisma.config.ts ./

# Génère le client Prisma (sans connexion DB, juste à partir du schéma)
RUN npx prisma generate

# ---------- Stage 2 : build ----------
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

# Variables build-time inoffensives (pas de secrets)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# DATABASE_URL bidon pour que `next build` n'échoue pas si Prisma valide la connexion
# (en runtime la vraie URL viendra de l'env Docker)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV AUTH_SECRET="build-time-placeholder"
ENV AUTH_TRUST_HOST="true"

RUN npm run build

# ---------- Stage 3 : runner ----------
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl curl tini

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copie le bundle standalone (server.js + node_modules minimal)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Le client Prisma (généré dans src/generated) est référencé par la sortie standalone
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated
# Migrations SQL Prisma (appliquées par docker/migrate.cjs au boot)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Client Prisma + adaptateur PG (runtime de l'app)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# pg + bcryptjs : nécessaires pour docker/migrate.cjs et docker/seed-admin.cjs
# Le standalone Next.js peut les bundler dans ses chunks, mais on les veut
# aussi en `require()` direct depuis nos scripts d'admin.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/split2 ./node_modules/split2
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-cloudflare ./node_modules/pg-cloudflare
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/xtend ./node_modules/xtend
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Dossier d'uploads persistant (sera monté en volume par docker-compose)
RUN mkdir -p /app/public/uploads/materiel /app/public/uploads/ouvriers \
 && chown -R nextjs:nodejs /app/public/uploads

# Scripts admin/maintenance (entrypoint, migrations, seed)
COPY --chown=nextjs:nodejs docker /app/docker
RUN chmod +x /app/docker/entrypoint.sh && cp /app/docker/entrypoint.sh /app/entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fs http://localhost:3000/api/auth/csrf > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
