import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "./db-errors";

describe("isUniqueViolation", () => {
  it("reconnaît un objet erreur Prisma P2002", () => {
    const e = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    expect(isUniqueViolation(e)).toBe(true);
  });

  it("objet nu avec code P2002 : vrai", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
  });

  it("autre code Prisma : faux", () => {
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
  });

  it("Error sans code : faux", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });

  it("null / undefined / chaîne : faux", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
  });
});
