import "server-only";
import nodemailer from "nodemailer";

/**
 * Service d'envoi d'email avec dégradation gracieuse :
 * - Si SMTP_HOST est configuré, on envoie vraiment
 * - Sinon on log dans la console serveur (utile en dev) et on retourne false
 *   pour que l'appelant puisse afficher le lien à l'admin (mode "fallback")
 */

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporterCache: nodemailer.Transporter | null | undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (transporterCache !== undefined) return transporterCache;

  const host = process.env.SMTP_HOST;
  if (!host) {
    transporterCache = null;
    return null;
  }

  transporterCache = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
  return transporterCache;
}

export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

/**
 * Envoie un email. Retourne true si effectivement envoyé via SMTP,
 * false si SMTP non configuré (dans ce cas on a juste loggé pour debug).
 */
export async function sendEmail(opts: SendOptions): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    // Mode fallback : log pour debug, l'appelant gère la suite
    // eslint-disable-next-line no-console
    console.log(
      `[email] SMTP non configuré, message non envoyé à ${opts.to} : ${opts.subject}`
    );
    return false;
  }

  const from =
    process.env.SMTP_FROM ?? `Autonhome <no-reply@${getDomainFromUrl()}>`;
  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return true;
}

function getDomainFromUrl(): string {
  try {
    const url = process.env.NEXTAUTH_URL ?? "https://autonhome.alphatek.fr";
    return new URL(url).hostname;
  } catch {
    return "autonhome.alphatek.fr";
  }
}

export function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL ?? "https://autonhome.alphatek.fr";
  return new URL(path, base).toString();
}
