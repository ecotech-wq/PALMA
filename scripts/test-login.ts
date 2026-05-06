import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const u = await db.user.findUnique({ where: { email: "admin@example.com" } });
  console.log("user found:", !!u);
  console.log("email:", u?.email);
  console.log("hash prefix:", u?.passwordHash.substring(0, 10));
  if (u) {
    const ok = await bcrypt.compare("admin123", u.passwordHash);
    console.log("bcrypt.compare(admin123) =", ok);
  }
  await db.$disconnect();
}

main().catch(console.error);
