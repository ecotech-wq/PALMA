/**
 * Active les notifications push (Web Push) en production, en une commande :
 *
 *   node scripts/setup-push.mjs
 *
 * Ce script s'exécute sur le poste de dev (il utilise l'alias SSH
 * `autonhome-vps`, voir DEPLOIEMENT-LOCAL.md). Il :
 *   1. vérifie que les clés VAPID ne sont pas déjà posées sur le serveur ;
 *   2. génère une paire de clés VAPID (web-push, déjà en dépendance) ;
 *   3. les ajoute au .env.production du VPS par SSH (via stdin : les clés
 *      n'apparaissent ni dans la ligne de commande ni à l'écran) ;
 *   4. relance le déploiement (git pull + rebuild, la clé publique est
 *      inlinée au build par NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 *
 * Ensuite, sur chaque téléphone/ordinateur : Profil -> « Activer les
 * notifications » -> autoriser. Rien d'autre.
 */
import { spawnSync, spawn } from "node:child_process";
import webpush from "web-push";

const HOST = "autonhome-vps";
const ENV_FILE = "/opt/autonhome/app/.env.production";
const SUBJECT = "mailto:admin@autonhome.alphatek.fr";

function ssh(cmd, opts = {}) {
  return spawnSync("ssh", ["-o", "BatchMode=yes", HOST, cmd], {
    encoding: "utf8",
    ...opts,
  });
}

// 1. Le serveur est-il joignable, et les clés déjà posées ?
const check = ssh(
  `grep -q '^VAPID_PUBLIC_KEY=' ${ENV_FILE} && echo EXISTS || echo MISSING`
);
if (check.status !== 0) {
  console.error("Connexion SSH impossible (alias autonhome-vps).");
  console.error(check.stderr?.trim() ?? "");
  process.exit(1);
}
if (check.stdout.includes("EXISTS")) {
  console.log(
    "Des clés VAPID sont déjà configurées sur le serveur : rien à faire.\n" +
      "Pour les régénérer (les appareils devront se réabonner), supprime les\n" +
      `lignes VAPID_* de ${ENV_FILE} puis relance ce script.`
  );
  process.exit(0);
}

// 2. Génération de la paire (localement, jamais affichée).
const keys = webpush.generateVAPIDKeys();
console.log("Clés VAPID générées (la clé privée ne sera pas affichée).");

// 3. Ajout au .env.production via stdin (pas de secret dans argv/écran).
const bloc =
  `\n# Web Push (ajouté par scripts/setup-push.mjs le ${new Date().toISOString().slice(0, 10)})\n` +
  `VAPID_PUBLIC_KEY=${keys.publicKey}\n` +
  `VAPID_PRIVATE_KEY=${keys.privateKey}\n` +
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}\n` +
  `VAPID_SUBJECT=${SUBJECT}\n`;
const append = spawnSync(
  "ssh",
  ["-o", "BatchMode=yes", HOST, `cat >> ${ENV_FILE}`],
  { input: bloc, encoding: "utf8" }
);
if (append.status !== 0) {
  console.error("Échec de l'écriture sur le serveur :", append.stderr?.trim());
  process.exit(1);
}
console.log(`Clés ajoutées à ${ENV_FILE}.`);

// 4. Redéploiement (la clé publique est inlinée au build).
console.log("Redéploiement (git pull + rebuild, quelques minutes)...");
const deploy = spawn(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    HOST,
    "cd /opt/autonhome/app && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build",
  ],
  { stdio: "inherit" }
);
deploy.on("close", (code) => {
  if (code === 0) {
    console.log(
      "\nNotifications push actives côté serveur." +
        "\nSur chaque appareil : Profil -> « Activer les notifications » -> autoriser." +
        "\n(Sur iPhone : installer d'abord l'app sur l'écran d'accueil, iOS 16.4+.)"
    );
  } else {
    console.error(`Le déploiement a échoué (code ${code}).`);
  }
  process.exit(code ?? 1);
});
