import { describe, it, expect } from "vitest";
import { BRAND } from "./brand";

/** Collecte récursivement toutes les chaînes du référentiel de marque. */
function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((v) => collectStrings(v));
  }
  return [];
}

describe("BRAND (référentiel de marque)", () => {
  it("porte une identité textuelle complète (aucun champ vide)", () => {
    expect(BRAND.appName.length).toBeGreaterThan(0);
    expect(BRAND.shortName.length).toBeGreaterThan(0);
    expect(BRAND.tagline.length).toBeGreaterThan(0);
    expect(BRAND.emailFromName.length).toBeGreaterThan(0);
    expect(BRAND.totpIssuer.length).toBeGreaterThan(0);
  });

  it("expose des couleurs hexadécimales valides (référence, pas de style UI)", () => {
    expect(BRAND.colors.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(BRAND.colors.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("référence des assets servis depuis la racine publique", () => {
    expect(BRAND.logo.startsWith("/")).toBe(true);
    expect(BRAND.logoIcon.startsWith("/")).toBe(true);
  });

  it("fournit un sujet VAPID de secours au format mailto:", () => {
    expect(BRAND.pushSubjectFallback.startsWith("mailto:")).toBe(true);
  });

  it("porte un domaine nu, sans protocole ni chemin (composable en URL)", () => {
    expect(BRAND.domain).not.toMatch(/^https?:\/\//);
    expect(BRAND.domain).not.toContain("/");
    // Le domaine doit être injectable tel quel dans `new URL`
    expect(() => new URL(`https://${BRAND.domain}`)).not.toThrow();
  });

  it("ne contient aucun tiret cadratin ni emoji dans ses chaînes", () => {
    for (const s of collectStrings(BRAND)) {
      expect(s).not.toContain("—");
      // Plage des émojis colorés courants (pictogrammes, symboles)
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)).toBe(false);
    }
  });
});
