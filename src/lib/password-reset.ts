import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/email";

const TOKEN_BYTES = 32;
const DEFAULT_VALIDITY_MINUTES = 120; // 2h pour reset auto-service

export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Crée un token de reset pour cet user (invalide les précédents non utilisés).
 * Retourne l'URL complète à envoyer (contient le token clair).
 */
export async function createResetTokenForUser(
  userId: string,
  validityMinutes: number = DEFAULT_VALIDITY_MINUTES
): Promise<{
  url: string;
  expiresAt: Date;
}> {
  // Invalide les anciens tokens non utilisés
  await db.passwordResetToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

  await db.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return {
    url: appUrl(`/reset-password?token=${encodeURIComponent(rawToken)}`),
    expiresAt,
  };
}

export async function consumeResetToken(rawToken: string): Promise<{
  userId: string;
} | null> {
  const tokenHash = hashToken(rawToken);
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt < new Date()) return null;

  await db.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { userId: record.userId };
}

export async function findValidTokenForUser(userId: string) {
  return db.passwordResetToken.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}
