import { describe, it, expect } from "vitest";
import { canApplyTag } from "./permissions";
import type { Role } from "./types";

const TOUS_LES_ROLES: Role[] = ["ADMIN", "CONDUCTEUR", "CHEF", "CLIENT"];

describe("canApplyTag", () => {
  it("tache : autorisé pour ADMIN, CONDUCTEUR et CHEF, refusé pour CLIENT", () => {
    expect(canApplyTag("ADMIN", "tache")).toBe(true);
    expect(canApplyTag("CONDUCTEUR", "tache")).toBe(true);
    expect(canApplyTag("CHEF", "tache")).toBe(true);
    expect(canApplyTag("CLIENT", "tache")).toBe(false);
  });

  it("incident : autorisé pour ADMIN, CONDUCTEUR et CHEF, refusé pour CLIENT", () => {
    expect(canApplyTag("ADMIN", "incident")).toBe(true);
    expect(canApplyTag("CONDUCTEUR", "incident")).toBe(true);
    expect(canApplyTag("CHEF", "incident")).toBe(true);
    expect(canApplyTag("CLIENT", "incident")).toBe(false);
  });

  it("reserve : autorisé pour ADMIN, CONDUCTEUR et CLIENT, refusé pour CHEF", () => {
    expect(canApplyTag("ADMIN", "reserve")).toBe(true);
    expect(canApplyTag("CONDUCTEUR", "reserve")).toBe(true);
    expect(canApplyTag("CLIENT", "reserve")).toBe(true);
    expect(canApplyTag("CHEF", "reserve")).toBe(false);
  });

  it("un code inconnu du catalogue est refusé pour tous les rôles", () => {
    for (const role of TOUS_LES_ROLES) {
      expect(canApplyTag(role, "urgent")).toBe(false);
      expect(canApplyTag(role, "")).toBe(false);
    }
  });

  it("tolère la casse et les accents sur le code du tag", () => {
    expect(canApplyTag("CHEF", "Tâche")).toBe(true);
    expect(canApplyTag("CLIENT", "RÉSERVE")).toBe(true);
    expect(canApplyTag("CLIENT", "Tâche")).toBe(false);
  });
});
