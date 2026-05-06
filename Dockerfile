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
# Schéma + migrations pour pouvoir lancer `prisma migrate deploy` au démarrage
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Dossier d'uploads persistant (sera monté en volume par docker-compose)
RUN mkdir -p /app/public/uploads/materiel /app/public/uploads/ouvriers \
 && chown -R nextjs:nodejs /app/public/uploads

# Script d'entrée qui applique les migrations puis lance le serveur
COPY --chown=nextjs:nodejs docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fs http://localhost:3000/api/auth/csrf > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
