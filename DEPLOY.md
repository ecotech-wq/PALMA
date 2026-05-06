# Déploiement sur VPS Hostinger

Guide pas-à-pas pour mettre Autonhome en production sur un VPS Linux (Ubuntu 22.04+
recommandé) avec un sous-domaine, HTTPS automatique et sauvegardes quotidiennes.

À la fin tu auras :
- L'app accessible sur `https://chantier.ton-domaine.com`
- Installable comme app Android via le bouton "Ajouter à l'écran d'accueil" de Chrome
- Une sauvegarde Postgres quotidienne dans `/var/autonhome/backups`

---

## 1. Pré-requis sur le VPS

```bash
# Connexion SSH au VPS
ssh root@TON_IP_VPS

# Mise à jour système
apt update && apt upgrade -y

# Installer Docker + Docker Compose (méthode officielle)
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin git

# Vérifier
docker --version
docker compose version
```

## 2. Configuration DNS (Hostinger)

Dans le panneau Hostinger → **DNS** de ton domaine :

| Type | Nom            | Valeur (Pointe vers) | TTL |
|------|----------------|----------------------|-----|
| A    | chantier       | IP_DE_TON_VPS        | 300 |

Attendre 5-15 min que la propagation DNS soit effective. Tester avec :
```bash
dig +short chantier.ton-domaine.com
# doit retourner l'IP de ton VPS
```

## 3. Cloner le projet sur le VPS

```bash
mkdir -p /opt/autonhome
cd /opt/autonhome
git clone <URL_DE_TON_REPO> app
cd app
```

> Si le repo n'est pas encore sur Git/GitHub, alternative : zip local du projet
> et `scp` vers le VPS.

## 4. Configurer les variables d'environnement

```bash
cp .env.production.example .env.production
# Génère deux secrets aléatoires :
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "AUTH_SECRET=$(openssl rand -base64 32)"
# Édite .env.production et reporte ces valeurs + APP_DOMAIN + ACME_EMAIL
nano .env.production
```

Vérifier le fichier :
```dotenv
APP_DOMAIN=chantier.ton-domaine.com
ACME_EMAIL=toi@ton-domaine.com
POSTGRES_PASSWORD=<32+ char aléatoire>
AUTH_SECRET=<32+ char aléatoire>
```

## 5. Premier démarrage

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

À la première exécution :
- L'image app est buildée (3-5 minutes)
- Postgres démarre, l'app applique automatiquement les migrations Prisma
- Caddy obtient un certificat Let's Encrypt automatiquement (vérifie que le port 443 est ouvert)

Surveiller les logs en direct :
```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f caddy
```

## 6. Créer l'admin initial

Une fois que `app` est `healthy` :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec app \
  node docker/seed-admin.mjs
```

La sortie t'affiche l'email et le mot de passe (généré aléatoirement si tu n'en
as pas mis dans `.env.production`). Note-le immédiatement.

## 7. Première connexion

Ouvre `https://chantier.ton-domaine.com` → page de login → connecte-toi avec
l'admin qui vient d'être créé.

## 8. Installer l'app sur Android

1. Ouvre `https://chantier.ton-domaine.com` dans **Chrome** sur ton téléphone Android
2. Connecte-toi
3. Menu Chrome (⋮) → **Ajouter à l'écran d'accueil** (ou un popup s'affiche automatiquement après quelques secondes)
4. L'icône Autonhome apparaît sur ton écran d'accueil ; au clic, l'app s'ouvre en plein écran sans la barre Chrome

**iPhone (Safari)** : icône Partager → "Sur l'écran d'accueil" → Ajouter.

## 9. Mettre à jour l'app (déploiements suivants)

```bash
cd /opt/autonhome/app
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Les migrations Prisma sont appliquées automatiquement au démarrage.

## 10. Sauvegardes

- **Automatique** : tous les jours à 03:00 UTC, dump compressé dans `./backups/ogc-YYYY-MM-DD-HHMM.sql.gz` ; conservation 30 jours
- **Manuelle** :
  ```bash
  docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh
  ```
- **Restauration** :
  ```bash
  gunzip -c ./backups/ogc-2026-XX-XX-XXXX.sql.gz | \
    docker compose -f docker-compose.prod.yml exec -T postgres psql -U ogc -d ogc
  ```
- **Copie hors-VPS** (recommandé sur ton 2e VPS Hostinger, hebdo) :
  Ajoute un cron sur ton 2e VPS qui fait `rsync` des `./backups/` :
  ```cron
  0 4 * * 0  rsync -az root@VPS1_IP:/opt/autonhome/app/backups/ /opt/autonhome-backups/
  ```

## 11. Diagnostic en cas de souci

```bash
# Statut des services
docker compose -f docker-compose.prod.yml ps

# Logs récents
docker compose -f docker-compose.prod.yml logs --tail 100 app
docker compose -f docker-compose.prod.yml logs --tail 100 caddy
docker compose -f docker-compose.prod.yml logs --tail 50 postgres

# Vérifier que Postgres est joignable
docker compose -f docker-compose.prod.yml exec postgres psql -U ogc -d ogc -c "SELECT count(*) FROM \"User\";"

# Redémarrer un service
docker compose -f docker-compose.prod.yml restart app

# Nettoyer et tout reconstruire (sans toucher aux volumes/data)
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## 12. Sécurité — checklist initiale

- [ ] Le firewall du VPS n'expose que les ports 22 (SSH), 80, 443
  ```bash
  ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
  ```
- [ ] Tu as changé le mot de passe admin par défaut après ta première connexion
- [ ] `AUTH_SECRET` et `POSTGRES_PASSWORD` sont aléatoires (jamais réutilisés)
- [ ] Le fichier `.env.production` n'est PAS commit sur Git (vérifié par .gitignore)
- [ ] Les ports Postgres (5432) et de l'app (3000) ne sont **pas** exposés publiquement
  → ils ne sont accessibles qu'à travers Caddy en HTTPS

---

## Architecture déployée

```
Internet (HTTPS 443)
       │
       ▼
   ┌───────┐  Caddy (HTTPS auto Let's Encrypt + reverse proxy)
   │ Caddy │
   └───┬───┘
       │ http (réseau interne ogc-net)
       ▼
   ┌───────┐
   │ Next  │  App Next.js standalone (port 3000)
   └───┬───┘
       │
       ▼
   ┌───────────┐
   │ Postgres  │  Données (volume persistant)
   └───────────┘
       │
       ▼
   ┌───────────┐
   │  backup   │  Cron pg_dump → ./backups (volume hôte)
   └───────────┘
```
