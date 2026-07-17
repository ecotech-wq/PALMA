import { describe, expect, it } from "vitest";
import { SUFFIXE_MINIATURE, urlMiniature } from "./photos";

describe("urlMiniature", () => {
  it("remplace le .webp final par .thumb.webp", () => {
    expect(urlMiniature("/uploads/journal/abc-123.webp")).toBe(
      "/uploads/journal/abc-123.thumb.webp"
    );
  });

  it("gère tous les dossiers d'upload", () => {
    for (const dossier of ["rapports", "materiel", "ouvriers", "logos", "pv"]) {
      expect(urlMiniature(`/uploads/${dossier}/x.webp`)).toBe(
        `/uploads/${dossier}/x${SUFFIXE_MINIATURE}`
      );
    }
  });

  it("est idempotente sur une URL déjà miniature", () => {
    expect(urlMiniature("/uploads/journal/abc.thumb.webp")).toBe(
      "/uploads/journal/abc.thumb.webp"
    );
  });

  it("laisse les non-webp inchangés (vidéos, PDF, images brutes)", () => {
    expect(urlMiniature("/uploads/journal/video.mp4")).toBe(
      "/uploads/journal/video.mp4"
    );
    expect(urlMiniature("/uploads/plans/plan.pdf")).toBe("/uploads/plans/plan.pdf");
    expect(urlMiniature("/uploads/plans/scan.jpg")).toBe("/uploads/plans/scan.jpg");
    expect(urlMiniature("/uploads/plans/scan.png")).toBe("/uploads/plans/scan.png");
  });

  it("laisse les data URLs et blobs inchangés", () => {
    expect(urlMiniature("data:image/webp;base64,AAAA")).toBe(
      "data:image/webp;base64,AAAA"
    );
    expect(urlMiniature("blob:http://localhost/xyz")).toBe(
      "blob:http://localhost/xyz"
    );
  });

  it("laisse la chaîne vide inchangée", () => {
    expect(urlMiniature("")).toBe("");
  });

  it("ne touche pas un .webp en plein milieu du chemin", () => {
    expect(urlMiniature("/uploads/x.webp/video.mp4")).toBe(
      "/uploads/x.webp/video.mp4"
    );
  });
});
