# Installation simple — 3 copier-coller

Cette procédure est conçue pour quelqu'un qui n'est pas développeur. Tu fais
3 copier-coller dans le terminal Hostinger, le script fait tout le reste.

---

## Préparatifs (5 minutes, une seule fois)

### 1. Crée un token GitHub

Le script va télécharger le code depuis GitHub. Pour ça il a besoin d'un token.

1. Ouvre [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) (en étant connecté à `ecotech-wq`)
2. **Token name** : `Autonhome VPS`
3. **Expiration** : `90 days`
4. **Repository access** : `Only select repositories` → choisis **PALMA**
5. **Repository permissions** :
   - **Contents** : `Read-only`
   - (Metadata Read-only se met automatiquement)
6. Clique **Generate token** en bas
7. **COPIE-LE** dans un bloc-notes — il commence par `github_pat_` — il ne sera affiché qu'une seule fois

### 2. Vérifie que le DNS est prêt

Sur Hostinger, dans la section DNS de `alphatek.fr`, tu dois avoir :

| Type | Name      | Content        |
|------|-----------|----------------|
| A    | autonhome | 195.35.24.128  |

(Tu l'as déjà — vu sur ton screenshot.)

---

## Déploiement (3 copier-coller)

### Étape 1 — Connecte-toi au VPS

Dans le panel Hostinger :
- Va sur **VPS** → ton VPS → bouton **Connect via SSH** (ou similaire)
- Une console noire s'ouvre dans le navigateur

### Étape 2 — Lance le script

Copie cette commande, colle-la dans la console (clic droit → Coller, ou Ctrl+Shift+V), puis appuie sur **Entrée** :

```bash
curl -fsSL -H "Authorization: token github_pat_XXXXXXXX" \
  https://raw.githubusercontent.com/ecotech-wq/PALMA/main/scripts/install-vps.sh \
  -o /tmp/install.sh && bash /tmp/install.sh
```

> **Important** : remplace `github_pat_XXXXXXXX` par **ton token GitHub** (celui que tu as copié à l'étape Préparatifs). Garde les guillemets.

### Étape 3 — Réponds aux questions

Le script va te demander :
1. **Domaine** → appuie juste sur Entrée (la valeur par défaut `autonhome.alphatek.fr` est correcte)
2. **Email Let's Encrypt** → mets ton email (sert pour les alertes de renouvellement de certificat)
3. **Token GitHub** → recolle ton token (il ne s'affichera pas, c'est normal)

Le script tourne ensuite tout seul pendant 3 à 5 minutes :
- ✓ Installe Docker s'il manque
- ✓ Détecte n8n (et ne le casse pas)
- ✓ Télécharge le code
- ✓ Génère les mots de passe
- ✓ Build l'image Docker
- ✓ Démarre Postgres + l'app
- ✓ Crée l'admin (le mot de passe s'affiche à la fin)
- ✓ Te donne les instructions pour finaliser le reverse proxy

### Étape 4 — Finalise le reverse proxy

À la fin du script, **copie-colle-moi la sortie complète** dans notre conversation. Selon ce que le script aura détecté (Caddy, Nginx Proxy Manager, Easypanel…), je te donnerai les 1-2 dernières actions spécifiques à ton setup.

---

## Une fois en ligne

- **Connexion** : ouvre `https://autonhome.alphatek.fr` dans ton navigateur, login avec l'admin que le script t'a affiché
- **Sur Android** : depuis Chrome, menu ⋮ → *Ajouter à l'écran d'accueil* → l'icône Autonhome apparaît, comme une vraie app

---

## Mise à jour future

Quand on développe de nouvelles fonctionnalités, tu n'as qu'à relancer dans le terminal SSH :

```bash
cd /opt/autonhome/app && git pull && \
  docker compose -f docker-compose.coexist.yml --env-file .env.production up -d --build
```

(Adapte `coexist` → `prod` si le script a utilisé l'autre fichier — il te le précisera.)

---

## En cas de souci

Si une erreur apparaît, **copie-colle l'erreur complète** dans notre conversation et je diagnostique. La plupart du temps, c'est un détail de config de reverse proxy à ajuster.
