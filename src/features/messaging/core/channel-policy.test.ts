import { describe, it, expect } from "vitest";
import {
  canSeeChannel,
  canCreateChannel,
  visibleChannels,
} from "./channel-policy";
import type { ChannelRef, ChannelRole, ChannelVisibility } from "./types";

/** Matrice de vérité complète rôle x visibilité (15 combinaisons). */
const MATRIX: Record<ChannelRole, Record<ChannelVisibility, boolean>> = {
  ADMIN: { INTERNE: true, CLIENT: true, SOUS_TRAITANT: true },
  CONDUCTEUR: { INTERNE: true, CLIENT: true, SOUS_TRAITANT: true },
  CHEF: { INTERNE: true, CLIENT: true, SOUS_TRAITANT: true },
  CLIENT: { INTERNE: false, CLIENT: true, SOUS_TRAITANT: false },
  SOUS_TRAITANT: { INTERNE: false, CLIENT: false, SOUS_TRAITANT: true },
};

const ROLES = Object.keys(MATRIX) as ChannelRole[];
const VISIBILITIES: ChannelVisibility[] = ["INTERNE", "CLIENT", "SOUS_TRAITANT"];

describe("canSeeChannel", () => {
  const cases: [ChannelRole, ChannelVisibility, boolean][] = ROLES.flatMap(
    (role) =>
      VISIBILITIES.map(
        (v): [ChannelRole, ChannelVisibility, boolean] => [
          role,
          v,
          MATRIX[role][v],
        ]
      )
  );

  it.each(cases)("%s x %s -> %s", (role, visibility, expected) => {
    expect(canSeeChannel(role, visibility)).toBe(expected);
  });
});

describe("canCreateChannel", () => {
  it("admin : oui", () => {
    expect(canCreateChannel({ isAdmin: true, isConducteur: false })).toBe(true);
  });
  it("conducteur : oui", () => {
    expect(canCreateChannel({ isAdmin: false, isConducteur: true })).toBe(true);
  });
  it("admin et conducteur : oui", () => {
    expect(canCreateChannel({ isAdmin: true, isConducteur: true })).toBe(true);
  });
  it("ni admin ni conducteur (chef, client) : non", () => {
    expect(canCreateChannel({ isAdmin: false, isConducteur: false })).toBe(
      false
    );
  });
});

describe("visibleChannels", () => {
  const ch = (
    id: string,
    visibility: ChannelVisibility,
    archivedAt: Date | null = null
  ): ChannelRef => ({ id, nom: id, visibility, ordre: 0, archivedAt });

  const channels: ChannelRef[] = [
    ch("general", "INTERNE"),
    ch("client", "CLIENT"),
    ch("st", "SOUS_TRAITANT"),
    ch("archive-interne", "INTERNE", new Date("2026-01-01")),
    ch("archive-client", "CLIENT", new Date("2026-01-01")),
  ];

  it("ADMIN voit tous les canaux actifs, jamais les archivés", () => {
    expect(visibleChannels("ADMIN", channels).map((c) => c.id)).toEqual([
      "general",
      "client",
      "st",
    ]);
  });

  it("CHEF voit tous les canaux actifs", () => {
    expect(visibleChannels("CHEF", channels).map((c) => c.id)).toEqual([
      "general",
      "client",
      "st",
    ]);
  });

  it("CLIENT ne voit que les canaux CLIENT actifs", () => {
    expect(visibleChannels("CLIENT", channels).map((c) => c.id)).toEqual([
      "client",
    ]);
  });

  it("SOUS_TRAITANT ne voit que les canaux SOUS_TRAITANT actifs", () => {
    expect(visibleChannels("SOUS_TRAITANT", channels).map((c) => c.id)).toEqual(
      ["st"]
    );
  });

  it("préserve l'ordre d'entrée", () => {
    const reversed = [...channels].reverse();
    expect(visibleChannels("ADMIN", reversed).map((c) => c.id)).toEqual([
      "st",
      "client",
      "general",
    ]);
  });

  it("liste vide -> liste vide", () => {
    expect(visibleChannels("ADMIN", [])).toEqual([]);
  });
});
