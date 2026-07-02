import { describe, it, expect } from "vitest";
import { readResourceKey } from "./unread";

describe("readResourceKey", () => {
  it("sans canal : clé historique du projet", () => {
    expect(readResourceKey("abc123")).toBe("chantier:abc123");
  });

  it("channelId undefined : clé historique", () => {
    expect(readResourceKey("abc123", undefined)).toBe("chantier:abc123");
  });

  it("channelId null : clé historique", () => {
    expect(readResourceKey("abc123", null)).toBe("chantier:abc123");
  });

  it("channelId chaîne vide : clé historique", () => {
    expect(readResourceKey("abc123", "")).toBe("chantier:abc123");
  });

  it("avec canal : clé suffixée par le canal", () => {
    expect(readResourceKey("abc123", "canal9")).toBe(
      "chantier:abc123:canal:canal9"
    );
  });

  it("deux canaux du même projet ont des clés distinctes", () => {
    expect(readResourceKey("p1", "a")).not.toBe(readResourceKey("p1", "b"));
  });

  it("le même canal sur deux projets a des clés distinctes", () => {
    expect(readResourceKey("p1", "a")).not.toBe(readResourceKey("p2", "a"));
  });
});
