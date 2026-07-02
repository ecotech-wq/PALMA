import { describe, it, expect } from "vitest";
import {
  canManageMembers,
  canJoinCanal,
  isInternalRole,
} from "./membership-policy";
import type { Role, CanalVisibility } from "@/generated/prisma/enums";

describe("canManageMembers", () => {
  it("admin : toujours, membre ou non", () => {
    expect(canManageMembers({ isAdmin: true, isConducteur: false }, false)).toBe(true);
    expect(canManageMembers({ isAdmin: true, isConducteur: false }, true)).toBe(true);
  });
  it("conducteur membre du chantier : oui", () => {
    expect(canManageMembers({ isAdmin: false, isConducteur: true }, true)).toBe(true);
  });
  it("conducteur NON membre : non (il ne gère pas les chantiers des autres)", () => {
    expect(canManageMembers({ isAdmin: false, isConducteur: true }, false)).toBe(false);
  });
  it("ni admin ni conducteur : jamais, même membre", () => {
    expect(canManageMembers({ isAdmin: false, isConducteur: false }, true)).toBe(false);
  });
});

describe("canJoinCanal (borne dure)", () => {
  // Matrice de vérité complète : 6 rôles x 3 visibilités.
  const MATRIX: Record<Role, Record<CanalVisibility, boolean>> = {
    ADMIN: { INTERNE: true, CLIENT: true, SOUS_TRAITANT: true },
    CONDUCTEUR: { INTERNE: true, CLIENT: true, SOUS_TRAITANT: true },
    CHEF: { INTERNE: true, CLIENT: true, SOUS_TRAITANT: true },
    CLIENT: { INTERNE: false, CLIENT: true, SOUS_TRAITANT: false },
    SOUS_TRAITANT: { INTERNE: false, CLIENT: false, SOUS_TRAITANT: true },
    OUVRIER: { INTERNE: false, CLIENT: false, SOUS_TRAITANT: false },
  };
  const cases = (Object.keys(MATRIX) as Role[]).flatMap((role) =>
    (Object.keys(MATRIX[role]) as CanalVisibility[]).map(
      (v): [Role, CanalVisibility, boolean] => [role, v, MATRIX[role][v]]
    )
  );
  it.each(cases)("%s sur canal %s -> %s", (role, visibility, expected) => {
    expect(canJoinCanal(role, visibility)).toBe(expected);
  });
});

describe("isInternalRole", () => {
  it("internes : ADMIN, CONDUCTEUR, CHEF", () => {
    expect(isInternalRole("ADMIN")).toBe(true);
    expect(isInternalRole("CONDUCTEUR")).toBe(true);
    expect(isInternalRole("CHEF")).toBe(true);
  });
  it("externes et ouvriers : non", () => {
    expect(isInternalRole("CLIENT")).toBe(false);
    expect(isInternalRole("SOUS_TRAITANT")).toBe(false);
    expect(isInternalRole("OUVRIER")).toBe(false);
  });
});
