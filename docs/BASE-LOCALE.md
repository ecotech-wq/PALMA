# Base de données locale : PostgreSQL natif Windows (sans Docker)

Depuis le 14 juillet 2026, la base de développement locale de LYNX ne dépend
plus de Docker Desktop. Elle tourne sur un PostgreSQL 16.14 natif Windows,
installé via l'installeur EDB (winget `PostgreSQL.PostgreSQL.16`), enregistré
comme service Windows et démarré automatiquement avec le PC. Docker n'est plus
nécessaire en local : les conteneurs `ogc-postgres` et `ogc-adminer` ont été
arrêtés et leur redémarrage automatique désactivé (`--restart=no`). Ils peuvent
être supprimés un jour avec `docker compose down -v`, mais rien ne presse et
rien n'en dépend.

## Comment ça tourne

Le service Windows s'appelle `postgresql-x64-16` (démarrage : Automatique,
compte : NT AUTHORITY\NetworkService). Il écoute sur le port 5433, le même que
celui qu'exposait le conteneur Docker, si bien que le `DATABASE_URL` et les
habitudes restent inchangés. L'instance est totalement indépendante du vieux
service `postgresql-x64-12` (port 5432) qui appartient à un autre projet : ne
pas y toucher.

Répertoires de l'instance 16 :

| Élément | Valeur |
|---|---|
| Binaires | `C:\Program Files\PostgreSQL\16\bin` |
| Données (cluster) | `C:\Program Files\PostgreSQL\16\data` |
| Journaux serveur | `C:\Program Files\PostgreSQL\16\data\log` |
| Port | 5433 |
| Base applicative | `ogc` |
| Superuser | `postgres` |

Le mot de passe du superuser est aléatoire (40 caractères) et vit à un seul
endroit : la ligne `DATABASE_URL` du fichier `.env` du repo. Il n'est écrit
nulle part ailleurs et ne doit être ni affiché ni copié dans un document.

Détail d'installation à connaître : la locale Windows du poste est
"French_Réunion.1252", dont le nom contient un caractère non ASCII qu'initdb
de PostgreSQL 16 refuse. L'installeur EDB échouait donc à l'étape initdb. Le
cluster a été initialisé avec `--locale=C --encoding=UTF8` (via le script
officiel `installer\server\initcluster.ps1` d'EDB), ce qui est sans incidence
pour l'application ; seul le tri SQL de chaînes accentuées suit l'ordre des
octets au lieu de l'ordre alphabétique français, sans effet visible dans LYNX.

## Redémarrer, arrêter, vérifier

Dans un PowerShell (élevé pour start/stop du service) :

```powershell
Get-Service postgresql-x64-16          # état du service
Restart-Service postgresql-x64-16      # redémarrage
Stop-Service postgresql-x64-16         # arrêt
Start-Service postgresql-x64-16        # démarrage
```

Ou avec l'interface graphique `services.msc`. Le service repart tout seul à
chaque démarrage du PC. Pour vérifier que la base répond :

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -h localhost -p 5433 -U postgres -d ogc -c 'SELECT version();'
```

(psql demandera le mot de passe : le prendre dans le `DATABASE_URL` du `.env`.)

## Recréer ou migrer la base

Les migrations SQL s'appliquent exactement comme avant, depuis le repo :

```powershell
cd C:\Projects\outil-gestion-chantier
node -r dotenv/config docker/migrate.cjs   # applique les migrations manquantes
npm run db:seed                            # (re)crée l'admin de dev du .env
npx tsx scripts/seed-demo.ts               # données de démo (skip si déjà là)
```

Le compte de connexion de développement est celui défini par
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` dans le `.env`
(admin@example.com par défaut).

## Ce qui a été vérifié le 14 juillet 2026

Installation : service `postgresql-x64-16` présent, Running, démarrage
Automatique, port 5433 en écoute. Base `ogc` créée, 41 migrations appliquées
(jusqu'à `20260714070000_module_labo` incluse), admin de dev présent en base,
seed de démo passé (6 chantiers). Serveur de production local
(`npm run start -- -p 3200`) lancé : `GET /login` répond 200, la racine
redirige vers `/login` (307) comme attendu, puis serveur de test arrêté et
port 3200 rendu.
