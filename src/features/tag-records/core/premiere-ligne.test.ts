import { describe, expect, it } from "vitest";
import { premiereLigne } from "./premiere-ligne";

describe("premiereLigne", () => {
  it("renvoie la première ligne d'un texte multi-lignes", () => {
    expect(premiereLigne("Fuite au sous-sol\nPrévenir le plombier")).toBe(
      "Fuite au sous-sol"
    );
  });

  it("tronque à 80 caractères par défaut", () => {
    const longue = "a".repeat(120);
    expect(premiereLigne(longue)).toHaveLength(80);
    expect(premiereLigne(longue)).toBe("a".repeat(80));
  });

  it("respecte un max personnalisé", () => {
    expect(premiereLigne("abcdef", 3)).toBe("abc");
  });

  it("saute les lignes vides de tête et trim la ligne retenue", () => {
    expect(premiereLigne("\n\n  Reprendre l'enduit  \nsuite")).toBe(
      "Reprendre l'enduit"
    );
  });

  it("renvoie une chaîne vide si le texte est vide ou blanc", () => {
    expect(premiereLigne("")).toBe("");
    expect(premiereLigne("   \n  \n")).toBe("");
  });
});
