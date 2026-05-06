/* eslint-disable */
// Crée ou met à jour l'admin initial — version production (sans Prisma TS).
// À lancer une seule fois après le premier déploiement :
//   docker compose -f docker-compose.coexist.yml --env-file .env.production exec app node docker/seed-admin.cjs
//
// Variables attendues :
//   DATABASE_URL              (depuis .env / docker)
//   SEED_ADMIN_EMAIL          (par défaut admin@autonhome.local)
//   SEED_ADMIN_PASSWORD       (par défaut généré aléatoirement et imprimé)
//   SEED_ADMIN_NAME           (par défaut "Administrateur")

const { randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("✗ DATABASE_URL manquant");
    process.exit(1);
  }

  const url = new URL(dbUrl);
  const client = new Client({
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.slice(1).split("?")[0],
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  });

  await client.connect();

  const email = (process.env.SEED_ADMIN_EMAIL || "admin@autonhome.local").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME || "Administrateur";
  let password = process.env.SEED_ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = randomBytes(9).toString("base64url");
    generated = true;
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  // ID au format proche de cuid (préfixe c + 24 chars)
  const id = "c" + randomBytes(12).toString("hex");

  const result = await client.query(
    `INSERT INTO "User" (id, email, name, "passwordHash", role, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ADMIN', NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET
       "passwordHash" = EXCLUDED."passwordHash",
       name = EXCLUDED.name,
       "updatedAt" = NOW()
     RETURNING email, role`,
    [id, email, name, passwordHash]
  );

  console.log("=========================================");
  console.log("Admin Autonhome :");
  console.log("  email    : " + result.rows[0].email);
  console.log("  role     : " + result.rows[0].role);
  if (generated) {
    console.log("  password : " + password);
    console.log("             (généré automatiquement, change-le après login)");
  } else {
    console.log("  password : (celui que tu as fourni dans SEED_ADMIN_PASSWORD)");
  }
  console.log("=========================================");

  await client.end();
})().catch((e) => {
  console.error("✗ Erreur lors du seed :");
  console.error(e);
  process.exit(1);
});
