import { describe, it, expect } from "vitest";
import {
  mealPrompt, normalizeName, MAX_NAME, DEFAULT_PROMPT,
  DENSITIES, systemPrompt, PLATE_CM, BOWL_CM,
} from "./prompt.ts";

describe("normalizeName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeName("  chicken burrito  ")).toBe("chicken burrito");
  });

  it("treats blank and non-string input as absent", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(42)).toBe("");
  });

  it("caps length at MAX_NAME", () => {
    expect(normalizeName("a".repeat(500))).toHaveLength(MAX_NAME);
  });
});

describe("mealPrompt", () => {
  it("returns the unchanged default when there is no usable name", () => {
    expect(mealPrompt(undefined)).toBe(DEFAULT_PROMPT);
    expect(mealPrompt("")).toBe(DEFAULT_PROMPT);
    expect(mealPrompt("   ")).toBe(DEFAULT_PROMPT);
    expect(mealPrompt(42)).toBe(DEFAULT_PROMPT);
  });

  it("includes the corrected name and defers to it", () => {
    const out = mealPrompt("chicken burrito");
    expect(out).toContain("chicken burrito");
    expect(out).toMatch(/portion/i);
    expect(out).not.toBe(DEFAULT_PROMPT);
  });

  it("uses the truncated name, not the raw one", () => {
    const out = mealPrompt("b".repeat(500));
    expect(out).toContain("b".repeat(MAX_NAME));
    expect(out).not.toContain("b".repeat(MAX_NAME + 1));
  });
});

describe("DENSITIES", () => {
  it("has enough entries to be useful", () => {
    expect(DENSITIES.length).toBeGreaterThanOrEqual(30);
  });

  it("entries are well formed", () => {
    for (const d of DENSITIES) {
      expect(d.name.trim()).not.toBe("");
      expect(Number.isInteger(d.kcal100g)).toBe(true);
      expect(d.kcal100g).toBeGreaterThan(0);
    }
  });

  it("has no duplicate names", () => {
    const names = DENSITIES.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers the high-error fat and starch cases", () => {
    const names = DENSITIES.map((d) => d.name);
    for (const required of ["olive oil", "butter", "white rice", "bread"]) {
      expect(names).toContain(required);
    }
  });
});

describe("systemPrompt", () => {
  it("keeps the plate and bowl reference sizes", () => {
    const out = systemPrompt();
    expect(out).toContain(String(PLATE_CM));
    expect(out).toContain(String(BOWL_CM));
  });

  it("includes density lines the model can multiply against", () => {
    const out = systemPrompt();
    expect(out).toContain("olive oil");
    expect(out).toContain(String(DENSITIES.find((d) => d.name === "olive oil")!.kcal100g));
  });

  it("instructs the grams-then-multiply method", () => {
    const out = systemPrompt();
    expect(out).toMatch(/gram/i);
    expect(out).toMatch(/multiply/i);
  });

  it("still tells the model to estimate generously", () => {
    expect(systemPrompt()).toMatch(/generous/i);
  });
});
