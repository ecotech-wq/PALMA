import "server-only";
import { TOTP, Secret } from "otpauth";
import { createHash, randomBytes } from "node:crypto";
import qrcode from "qrcode";

/* -------------------------------------------------------------------------
 *  2FA TOTP (RFC 6238) — Authentificateur compatible Google Authenticator,
 *  Authy, 1Password, etc.
 *
 *  Issuer = nom de l'app (apparaît dans l'app du téléphone).
 *  Window = 1 : on accepte le code courant ± un cycle de 30s (clock skew).
 * ----------------------------------------------------------------------- */

const ISSUER = "Autonhome";
const WINDOW = 1;
const DIGITS = 6;
const PERIOD = 30;

function buildTotp(secret: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

/** Génère un nouveau secret base32 (~160 bits) pour l'enrôlement. */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/**
 * Génère l'URL `otpauth://` correspondant au secret + un Data URL PNG
 * de son QR code. Le label est typiquement l'email de l'utilisateur.
 */
export async function totpQrCodeDataUrl(
  secret: string,
  label: string
): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
  const t = buildTotp(secret, label);
  const otpauthUrl = t.toString();
  const qrDataUrl = await qrcode.toDataURL(otpauthUrl, {
    margin: 1,
    width: 256,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  return { otpauthUrl, qrDataUrl };
}

/**
 * Vérifie un code TOTP (6 chiffres) contre le secret. Accepte
 * ± `WINDOW` cycle pour absorber le drift d'horloge.
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  const clean = (token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const t = buildTotp(secret, ISSUER);
  const delta = t.validate({ token: clean, window: WINDOW });
  return delta !== null;
}

/**
 * Génère 10 backup codes humains-lisibles (format XXXX-XXXX, base32 sans
 * les caractères ambigus 0/O/1/I). Renvoie les codes en clair (à afficher
 * UNE seule fois) + leurs hashes SHA-256 (à stocker en BDD).
 */
export function generateBackupCodes(count = 10): {
  plain: string[];
  hashes: string[];
} {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const buf = randomBytes(8);
    let s = "";
    for (let j = 0; j < 8; j++) s += alphabet[buf[j] % alphabet.length];
    plain.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return {
    plain,
    hashes: plain.map((c) => hashBackupCode(c)),
  };
}

/** Hash d'un backup code (SHA-256 hex). */
export function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update(code.replace(/[\s-]/g, "").toUpperCase())
    .digest("hex");
}
