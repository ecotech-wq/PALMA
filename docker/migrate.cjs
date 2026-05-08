/* eslint-disable */
/**
 * Mini migrateur SQL pour Autonhome — remplace `prisma migrate deploy`.
 *
 * Pourquoi : la CLI Prisma a beaucoup de dépendances transitives qui ne se
 * retrouvent pas toutes dans une image Next.js standalone. Au lieu de les
 * pourchasser, on lit nous-mêmes les fichiers SQL de `prisma/migrations/`
 * et on les applique avec `pg`, qui est déjà disponible au runtime.
 *
 * Le format de la table `_prisma_migrations` reste compatible avec Prisma :
 * si tu lances `prisma migrate status` plus tard, il verra les bonnes
 * migrations comme appliquées.
 *
 * Lancé par docker/entrypoint.sh au démarrage du conteneur.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client } = require("pg");

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[migrate] DATABASE_URL manquant");
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

  // Crée la table de tracking si elle n'existe pas
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Liste les migrations sur disque
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("[migrate] Aucun dossier prisma/migrations/, rien à faire");
    await client.end();
    return;
  }

  const dirs = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((d) => /^\d{14}_/.test(d))
    .sort();

  if (dirs.length === 0) {
    console.log("[migrate] Aucune migration trouvée, rien à faire");
    await client.end();
    return;
  }

  // Liste les migrations déjà appliquées
  const { rows } = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`
  );
  const applied = new Set(rows.map((r) => r.migration_name));

  let pendingCount = 0;
  for (const dir of dirs) {
    if (applied.has(dir)) {
      console.log(`[migrate] ✓ ${dir} (already applied)`);
      continue;
    }

    const sqlPath = path.join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.warn(`[migrate] ! ${dir} : pas de migration.sql, skip`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const id = crypto.randomUUID();

    console.log(`[migrate] ▶ ${dir} (applying...)`);

    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at)
       VALUES ($1, $2, $3, NOW())`,
      [id, checksum, dir]
    );

    try {
      // Applique le SQL en une seule requête.
      // psql gère plusieurs statements séparés par des ; dans un seul query().
      await client.query(sql);
      await client.query(
        `UPDATE "_prisma_migrations" SET finished_at = NOW(), applied_steps_count = 1 WHERE id = $1`,
        [id]
      );
      console.log(`[migrate] ✓ ${dir} applied`);
      pendingCount++;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : String(e);
      console.error(`[migrate] ✗ ${dir} FAILED: ${msg}`);
      await client.query(
        `UPDATE "_prisma_migrations" SET rolled_back_at = NOW(), logs = $1 WHERE id = $2`,
        [msg, id]
      );
      await client.end();
      throw e;
    }
  }

  if (pendingCount === 0) {
    console.log("[migrate] No pending migrations.");
  } else {
    console.log(`[migrate] ${pendingCount} migration(s) applied.`);
  }

  await client.end();
}

main().catch((e) => {
  console.error("[migrate] FATAL:", e);
  process.exit(1);
});
