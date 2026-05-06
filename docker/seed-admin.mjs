// Crée ou met à jour l'admin initial. À lancer une seule fois après le premier déploiement :
//   docker compose -f docker-compose.prod.yml exec app node docker/seed-admin.mjs
// Ou en local : node docker/seed-admin.mjs
//
// Variables attendues :
//   DATABASE_URL              (depuis .env / docker)
//   SEED_ADMIN_EMAIL          (par défaut admin@autonhome.local)
//   SEED_ADMIN_PASSWORD       (par défaut généré aléatoirement et imprimé)
//   SEED_ADMIN_NAME           (par défaut "Administrateur")

import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@autonhome.local").toLowerCase();
const name = process.env.SEED_ADMIN_NAME ?? "Administrateur";
let password = process.env.SEED_ADMIN_PASSWORD;
let generated = false;
if (!password) {
  password = randomBytes(9).toString("base64url");
  generated = true;
}

const passwordHash = await bcrypt.hash(password, 10);

const user = await db.user.upsert({
  where: { email },
  update: { name, passwordHash, role: "ADMIN" },
  create: { email, name, passwordHash, role: "ADMIN" },
});

console.log("=========================================");
console.log("Admin pret :");
console.log("  email    : " + user.email);
if (generated) {
  console.log("  password : " + password + "  (généré, change-le après login)");
} else {
  console.log("  password : (celui que tu as fourni)");
}
console.log("=========================================");

await db.$disconnect();
