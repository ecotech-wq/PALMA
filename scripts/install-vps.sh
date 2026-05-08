#!/usr/bin/env bash
# =====================================================================
#  Autonhome — Script d'installation VPS
#  Installe Docker si nécessaire, déploie l'app, et tente de l'intégrer
#  au reverse proxy déjà présent (notamment celui qui sert n8n).
#
#  À lancer en root sur le VPS :
#    bash <(curl -fsSL https://...) ou en collant le contenu
# =====================================================================

set -euo pipefail

# Couleurs
C_RESET=$'\033[0m'; C_BLUE=$'\033[1;34m'; C_GREEN=$'\033[1;32m'
C_YELLOW=$'\033[1;33m'; C_RED=$'\033[1;31m'; C_DIM=$'\033[2m'

step()   { echo ""; echo "${C_BLUE}▶ $*${C_RESET}"; }
ok()     { echo "${C_GREEN}✓ $*${C_RESET}"; }
warn()   { echo "${C_YELLOW}! $*${C_RESET}"; }
err()    { echo "${C_RED}✗ $*${C_RESET}" >&2; }
info()   { echo "${C_DIM}  $*${C_RESET}"; }

# =====================================================================
# Pré-vérifications
# =====================================================================

if [ "$(id -u)" -ne 0 ]; then
  err "Ce script doit être lancé en root. Réessaie avec : sudo bash $0"
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/autonhome}"
APP_PORT="${APP_PORT:-3010}"          # port localhost de l'app (interne)
REPO_URL_DEFAULT="https://github.com/ecotech-wq/PALMA.git"

clear
cat <<'BANNER'

   █████╗ ██╗   ██╗████████╗ ██████╗ ███╗   ██╗██╗  ██╗ ██████╗ ███╗   ███╗███████╗
  ██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗████╗  ██║██║  ██║██╔═══██╗████╗ ████║██╔════╝
  ███████║██║   ██║   ██║   ██║   ██║██╔██╗ ██║███████║██║   ██║██╔████╔██║█████╗
  ██╔══██║██║   ██║   ██║   ██║   ██║██║╚██╗██║██╔══██║██║   ██║██║╚██╔╝██║██╔══╝
  ██║  ██║╚██████╔╝   ██║   ╚██████╔╝██║ ╚████║██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗
  ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝

  Installation de l'app de gestion de chantier sur ce VPS.

BANNER

# =====================================================================
# Saisie des variables (interactive)
# =====================================================================

step "Configuration"

# Domaine
DEFAULT_DOMAIN="autonhome.alphatek.fr"
read -p "  Domaine où l'app sera accessible [${DEFAULT_DOMAIN}] : " APP_DOMAIN
APP_DOMAIN="${APP_DOMAIN:-$DEFAULT_DOMAIN}"

# Email
read -p "  Email pour les certificats Let's Encrypt : " ACME_EMAIL
while [ -z "$ACME_EMAIL" ]; do
  read -p "  Email obligatoire : " ACME_EMAIL
done

# Token GitHub
echo ""
echo "  Pour télécharger le code, le script a besoin d'un token GitHub"
echo "  (créé sur github.com/settings/personal-access-tokens/new"
echo "   → repository PALMA → Contents = Read-only)."
read -s -p "  Colle ton token GitHub (caché) : " GITHUB_TOKEN
echo ""
while [ -z "$GITHUB_TOKEN" ]; do
  read -s -p "  Token obligatoire : " GITHUB_TOKEN
  echo ""
done

REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"

ok "Domaine : ${APP_DOMAIN}"
ok "Email   : ${ACME_EMAIL}"
ok "Repo    : ${REPO_URL}"

# =====================================================================
# 1. Docker
# =====================================================================

step "Vérification Docker"

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker non installé — installation automatique"
  curl -fsSL https://get.docker.com | sh
  ok "Docker installé"
else
  ok "Docker déjà installé : $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  warn "Docker Compose plugin manquant — installation"
  apt-get update -qq
  apt-get install -y docker-compose-plugin
fi
ok "Docker Compose : $(docker compose version | head -1)"

# =====================================================================
# 2. Détection du contexte (n8n, reverse proxy)
# =====================================================================

step "Détection de l'environnement existant"

DETECTED_PROXY="aucun"
PROXY_HINT=""

# Caddy en service systemd
if systemctl is-active caddy >/dev/null 2>&1; then
  DETECTED_PROXY="caddy-system"
  PROXY_HINT="systemd"
  ok "Caddy détecté (service systemd)"
fi

# Conteneurs Docker connus comme reverse proxy
if docker ps --format '{{.Image}}' 2>/dev/null | grep -Eq '^(caddy|jc21/nginx-proxy-manager|traefik|nginx-proxy)'; then
  DETECTED_PROXY="docker-proxy"
  if docker ps --format '{{.Image}}' | grep -q 'caddy'; then
    PROXY_HINT="caddy-docker"
    ok "Caddy détecté (dans Docker)"
  elif docker ps --format '{{.Image}}' | grep -q 'nginx-proxy-manager'; then
    PROXY_HINT="npm"
    ok "Nginx Proxy Manager détecté"
  elif docker ps --format '{{.Image}}' | grep -q 'traefik'; then
    PROXY_HINT="traefik"
    ok "Traefik détecté"
  fi
fi

# Easypanel / Coolify
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qiE '(easypanel|coolify)'; then
  DETECTED_PROXY="panel"
  if docker ps --format '{{.Names}}' | grep -qi easypanel; then
    PROXY_HINT="easypanel"
    ok "Easypanel détecté"
  else
    PROXY_HINT="coolify"
    ok "Coolify détecté"
  fi
fi

# Nginx natif
if [ "$DETECTED_PROXY" = "aucun" ] && systemctl is-active nginx >/dev/null 2>&1; then
  DETECTED_PROXY="nginx-system"
  PROXY_HINT="nginx"
  ok "Nginx détecté (service systemd)"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi n8n; then
  ok "n8n détecté — l'app cohabitera avec lui"
fi

if [ "$DETECTED_PROXY" = "aucun" ]; then
  warn "Aucun reverse proxy détecté — le script va installer Caddy en Docker"
fi

# =====================================================================
# 3. Cloner le repo
# =====================================================================

step "Téléchargement du code"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# URL avec token (le token reste local au script, jamais committé)
AUTHED_URL=$(echo "$REPO_URL" | sed "s|https://|https://x-access-token:${GITHUB_TOKEN}@|")

if [ -d "$INSTALL_DIR/app/.git" ]; then
  info "Repo déjà cloné, mise à jour"
  cd "$INSTALL_DIR/app"
  git remote set-url origin "$AUTHED_URL"
  git fetch origin main
  git reset --hard origin/main
  git remote set-url origin "$REPO_URL"  # nettoie le token
else
  git clone "$AUTHED_URL" "$INSTALL_DIR/app"
  cd "$INSTALL_DIR/app"
  git remote set-url origin "$REPO_URL"  # nettoie le token de la config
fi
ok "Code téléchargé dans $INSTALL_DIR/app"

# =====================================================================
# 4. Génération des secrets
# =====================================================================

step "Génération des secrets"

ENV_FILE="$INSTALL_DIR/app/.env.production"

if [ -f "$ENV_FILE" ]; then
  ok ".env.production existant conservé"
else
  POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  AUTH_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)
  cat > "$ENV_FILE" <<EOF
APP_DOMAIN=${APP_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
SEED_ADMIN_EMAIL=admin@${APP_DOMAIN#*.}
SEED_ADMIN_NAME=Administrateur
SEED_ADMIN_PASSWORD=
EOF
  chmod 600 "$ENV_FILE"
  ok "Secrets générés et stockés dans $ENV_FILE (mode 600)"
fi

# =====================================================================
# 5. Choix du mode de déploiement
# =====================================================================

step "Préparation du docker compose"

# Si un reverse proxy externe existe, on n'embarque pas Caddy ; on bind l'app
# uniquement sur 127.0.0.1:APP_PORT pour qu'il/elle l'attaque en HTTP local.
COMPOSE_FILE="docker-compose.prod.yml"

if [ "$DETECTED_PROXY" != "aucun" ]; then
  warn "Reverse proxy externe détecté → l'app sera exposée sur 127.0.0.1:${APP_PORT}"
  COMPOSE_FILE="docker-compose.coexist.yml"
  cat > "$INSTALL_DIR/app/$COMPOSE_FILE" <<EOF
services:
  postgres:
    image: postgres:16-alpine
    container_name: autonhome-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ogc
      POSTGRES_USER: ogc
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - autonhome_postgres:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ogc -d ogc"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - autonhome-net

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: autonhome-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://ogc:\${POSTGRES_PASSWORD}@postgres:5432/ogc?schema=public
      AUTH_SECRET: \${AUTH_SECRET}
      AUTH_TRUST_HOST: "true"
      NEXTAUTH_URL: https://\${APP_DOMAIN}
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"
      # SMTP (optionnel) : envoi d'emails de reset MdP
      SMTP_HOST: \${SMTP_HOST:-}
      SMTP_PORT: \${SMTP_PORT:-465}
      SMTP_SECURE: \${SMTP_SECURE:-true}
      SMTP_USER: \${SMTP_USER:-}
      SMTP_PASS: \${SMTP_PASS:-}
      SMTP_FROM: \${SMTP_FROM:-}
    ports:
      - "127.0.0.1:${APP_PORT}:3000"
    volumes:
      - autonhome_uploads:/app/public/uploads
    networks:
      - autonhome-net

  backup:
    image: postgres:16-alpine
    container_name: autonhome-backup
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PGHOST: postgres
      PGUSER: ogc
      PGDATABASE: ogc
      PGPASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - ./backups:/backups
      - ./docker/backup.sh:/usr/local/bin/backup.sh:ro
    entrypoint: ["/bin/sh", "-c"]
    command: |
      "
      apk add --no-cache dcron tzdata > /dev/null 2>&1 || true
      chmod +x /usr/local/bin/backup.sh
      echo '0 3 * * * /usr/local/bin/backup.sh >> /backups/backup.log 2>&1' > /etc/crontabs/root
      crond -f -l 8
      "
    networks:
      - autonhome-net

volumes:
  autonhome_postgres:
  autonhome_uploads:

networks:
  autonhome-net:
    driver: bridge
EOF
  ok "docker-compose.coexist.yml généré (sans Caddy embarqué)"
else
  ok "Utilisation de docker-compose.prod.yml (avec Caddy + HTTPS auto)"
fi

# =====================================================================
# 6. Build & démarrage
# =====================================================================

step "Build de l'image Docker (peut prendre 3-5 min)"

mkdir -p "$INSTALL_DIR/app/backups"

docker compose -f "$INSTALL_DIR/app/$COMPOSE_FILE" --env-file "$ENV_FILE" \
  build app
ok "Image construite"

step "Démarrage des services"
docker compose -f "$INSTALL_DIR/app/$COMPOSE_FILE" --env-file "$ENV_FILE" \
  up -d
ok "Services démarrés"

# Attendre que l'app réponde
step "Attente du démarrage de l'app"
for i in $(seq 1 30); do
  if curl -fs -m 2 "http://127.0.0.1:${APP_PORT}/api/auth/csrf" >/dev/null 2>&1; then
    ok "App répond sur http://127.0.0.1:${APP_PORT}"
    break
  fi
  sleep 2
  if [ $((i % 5)) -eq 0 ]; then
    info "(attente... ${i}/30)"
  fi
done

# =====================================================================
# 7. Création de l'admin
# =====================================================================

step "Création de l'administrateur initial"

ADMIN_OUTPUT=$(docker compose -f "$INSTALL_DIR/app/$COMPOSE_FILE" \
  --env-file "$ENV_FILE" exec -T app node docker/seed-admin.cjs 2>&1 || true)
echo "$ADMIN_OUTPUT" | grep -E "email|password" || echo "$ADMIN_OUTPUT" | tail -10

# =====================================================================
# 8. Configuration reverse proxy
# =====================================================================

step "Configuration du reverse proxy"

case "$PROXY_HINT" in
  caddy-docker|caddy-system)
    cat <<EOF
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
${C_YELLOW}Caddy détecté.${C_RESET} Ajoute ce bloc dans ton ${C_BLUE}Caddyfile${C_RESET}, puis recharge :

  ${APP_DOMAIN} {
      reverse_proxy 127.0.0.1:${APP_PORT}
  }

Recharge :
  ${C_DIM}# si Caddy système${C_RESET}
  systemctl reload caddy
  ${C_DIM}# si Caddy en Docker${C_RESET}
  docker exec \$(docker ps --format '{{.Names}}' | grep -i caddy | head -1) caddy reload --config /etc/caddy/Caddyfile
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
EOF
    ;;
  npm)
    cat <<EOF
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
${C_YELLOW}Nginx Proxy Manager détecté.${C_RESET}

Ouvre l'interface NPM dans ton navigateur, puis :
  1. Hosts → Proxy Hosts → Add Proxy Host
  2. Domain Names      : ${APP_DOMAIN}
  3. Forward Hostname  : 127.0.0.1
  4. Forward Port      : ${APP_PORT}
  5. Cache Assets / Block Common Exploits / Websockets : tous activés
  6. Onglet SSL : Request a new SSL Certificate (Let's Encrypt) + Force SSL
  7. Save
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
EOF
    ;;
  traefik)
    cat <<EOF
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
${C_YELLOW}Traefik détecté.${C_RESET} Ajoute ces labels au service \`app\` du fichier
${INSTALL_DIR}/app/${COMPOSE_FILE} et redémarre :

  labels:
    - traefik.enable=true
    - traefik.http.routers.autonhome.rule=Host(\`${APP_DOMAIN}\`)
    - traefik.http.routers.autonhome.entrypoints=websecure
    - traefik.http.routers.autonhome.tls.certresolver=le
    - traefik.http.services.autonhome.loadbalancer.server.port=3000

Puis attache l'app au réseau Traefik (souvent \`proxy\`) :

  networks:
    autonhome-net:
    proxy:
      external: true

Et relance :
  cd ${INSTALL_DIR}/app
  docker compose -f ${COMPOSE_FILE} --env-file .env.production up -d
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
EOF
    ;;
  easypanel|coolify)
    cat <<EOF
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
${C_YELLOW}${PROXY_HINT^} détecté.${C_RESET}

Ouvre le panneau ${PROXY_HINT^} dans ton navigateur, puis ajoute un service :
  - Type : Reverse proxy / Custom domain
  - Domaine : ${APP_DOMAIN}
  - Cible : http://127.0.0.1:${APP_PORT}
  - Active SSL automatique (Let's Encrypt)
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
EOF
    ;;
  nginx)
    cat <<EOF
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
${C_YELLOW}Nginx détecté.${C_RESET} Crée /etc/nginx/sites-available/autonhome avec :

  server {
      server_name ${APP_DOMAIN};
      location / {
          proxy_pass http://127.0.0.1:${APP_PORT};
          proxy_http_version 1.1;
          proxy_set_header Upgrade \$http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host \$host;
          proxy_set_header X-Real-IP \$remote_addr;
          proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto \$scheme;
      }
  }

Puis :
  ln -s /etc/nginx/sites-available/autonhome /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  certbot --nginx -d ${APP_DOMAIN}
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
EOF
    ;;
  *)
    cat <<EOF
${C_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
Aucun reverse proxy détecté → Caddy embarqué a démarré et obtient
automatiquement le certificat HTTPS Let's Encrypt pour ${APP_DOMAIN}.
${C_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
EOF
    ;;
esac

# =====================================================================
# 9. Récap final
# =====================================================================

cat <<EOF

${C_GREEN}╔════════════════════════════════════════════════════════════════════╗
║  Installation terminée                                             ║
╚════════════════════════════════════════════════════════════════════╝${C_RESET}

  URL de l'app  : ${C_BLUE}https://${APP_DOMAIN}${C_RESET}
  Repo          : ${INSTALL_DIR}/app
  Fichier env   : ${ENV_FILE} ${C_DIM}(mode 600)${C_RESET}
  Compose       : ${COMPOSE_FILE}

  ${C_YELLOW}Identifiants admin : voir ci-dessus dans la sortie de seed-admin.cjs${C_RESET}

  ${C_DIM}Commandes utiles :${C_RESET}
    cd ${INSTALL_DIR}/app
    docker compose -f ${COMPOSE_FILE} --env-file .env.production logs -f app
    docker compose -f ${COMPOSE_FILE} --env-file .env.production restart app

  ${C_DIM}Mise à jour ultérieure :${C_RESET}
    cd ${INSTALL_DIR}/app
    git pull
    docker compose -f ${COMPOSE_FILE} --env-file .env.production up -d --build

EOF
